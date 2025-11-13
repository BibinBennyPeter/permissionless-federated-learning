
"""
client_submit.py
Client-side pipeline for permissionless FL :
- compute delta (local - global)
- clip, add Gaussian noise (DP)
- deterministic serialization + sha256
- save artifact file (.npz)
- upload to local IPFS daemon
- sign the CID+meta with an Ethereum key (eth-account)
- produce JSON payload to send to aggregator
"""

import os
import requests
import hashlib
import json
import numpy as np
import ipfshttpclient
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
import torch


load_dotenv()

# ---------------------
# Helpers: deterministic serialization & hashing
# ---------------------
def deterministic_state_dict_bytes(state_dict):
    """
    Convert a PyTorch state_dict into deterministic bytes:
    - sorted keys
    - float32, C-contiguous
    Returns bytes
    """
    parts = []
    for k in sorted(state_dict.keys()):
        tensor = state_dict[k].cpu().detach().numpy().astype(np.float32)
        arr = np.ascontiguousarray(tensor)
        # append key, shape, then raw bytes to avoid ambiguity
        parts.append(k.encode("utf-8"))
        parts.append(b"|")
        parts.append(np.array(arr.shape, dtype=np.int64).tobytes())
        parts.append(b"|")
        parts.append(arr.tobytes())
        parts.append(b"\n")
    return b"".join(parts)

def sha256_bytes(b):
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()

# ---------------------
# Delta / clipping / noise (L2 clip + Gaussian noise)
# ---------------------
def compute_delta(global_state, local_state):
    delta = {}
    for k in global_state.keys():
        g = global_state[k].cpu().detach().numpy().astype(np.float32)
        l = local_state[k].cpu().detach().numpy().astype(np.float32)
        delta[k] = l - g
    return delta

def clip_and_noise_delta(delta, clip_norm=1.0, sigma=0.5):
    # flatten all arrays into one vector for clipping/noising
    keys = sorted(delta.keys())
    arrays = [np.ascontiguousarray(delta[k].ravel()) for k in keys]
    flat = np.concatenate(arrays).astype(np.float32)
    norm = np.linalg.norm(flat)
    if norm > clip_norm:
        flat = flat * (clip_norm / norm)
    # gaussian noise
    noise = np.random.normal(0, sigma * clip_norm, size=flat.shape).astype(np.float32)
    flat_noised = flat + noise
    # unflatten into dict
    out = {}
    idx = 0
    for k in keys:
        size = delta[k].size
        out[k] = flat_noised[idx:idx+size].reshape(delta[k].shape)
        idx += size
    return out

# ---------------------
# Save artifact to npz
# ---------------------
def save_delta_npz(delta, path):
    # convert arrays to float32 and save as .npz
    npz_dict = {}
    for k, v in delta.items():
        npz_dict[k] = np.ascontiguousarray(v.astype(np.float32))
    np.savez_compressed(path, **npz_dict)

# ---------------------
# IPFS upload
# ---------------------
def upload_to_ipfs(path, api_url):
    """
    Upload a file to a local IPFS daemon via HTTP API and return the CID (Hash).
    Requires `ipfs daemon` running locally and python-requests installed.
    """
    with open(path, "rb") as f:
        # field name is "file" (ipfs accepts any multipart file key)
        files = {"file": (os.path.basename(path), f)}
        resp = requests.post(api_url, files=files, timeout=60)
    resp.raise_for_status()
    # IPFS returns a plain text line like: {"Name":"file","Hash":"Qm...","Size":"1234"}
    # If the daemon returns plain JSON string, parse it:
    try:
        # Some go-ipfs versions return newline-delimited JSON; take last line
        text = resp.text.strip().splitlines()[-1]
        j = json.loads(text)
        return j["Hash"]
    except Exception as ex:
        raise RuntimeError(f"Failed to parse IPFS add response: {resp.text}") from ex
# ---------------------
# Ethereum signing (eth-account)
# ---------------------
def sign_payload(private_key_hex, cid, round_num, num_examples, quality):
    acct = Account.from_key(private_key_hex)
    # create a deterministic message string
    message = f"{cid}|round:{round_num}|examples:{num_examples}|quality:{quality}"
    msg = encode_defunct(text=message)
    signed = acct.sign_message(msg)
    return {
        "address": acct.address,
        "message": message,
        "signature": signed.signature.hex()
    }


# ---------------------
# Load model from npz 
# ---------------------
def load_model_from_npz(npz_path, model_class):
    data = np.load(npz_path)
    model = model_class()
    state_dict = model.state_dict()
    for k in state_dict.keys():
        arr = torch.from_numpy(data[k])
        state_dict[k].copy_(arr)
    model.load_state_dict(state_dict)
    return model

# ---------------------
# Main client workflow (example)
# ---------------------
def run_client_workflow(global_model, local_model, private_key_hex, round_num, num_examples, quality,
                        artifact_dir="artifacts"):
    os.makedirs(artifact_dir, exist_ok=True)

    # 1) compute delta
    global_state = global_model.state_dict()
    local_state = local_model.state_dict()
    delta = compute_delta(global_state, local_state)

    # 2) clip + DP noise
    delta_noised = clip_and_noise_delta(delta, clip_norm=1.0, sigma=0.5)

    # 3) save artifact deterministically
    artifact_path = os.path.join(artifact_dir, f"delta_round{round_num}_{num_examples}.npz")
    save_delta_npz(delta_noised, artifact_path)

    # 4) compute canonical sha256 (optional, for local verification)
    # We can re-create deterministic bytes from delta dict and sha256 them.
    # For convenience, compute sha over the .npz file bytes:
    with open(artifact_path, "rb") as f:
        file_bytes = f.read()
    file_sha256 = sha256_bytes(file_bytes)

    # 5) upload to IPFS
    ipfs_api = os.getenv("IPFS_API")
    cid = upload_to_ipfs(artifact_path, ipfs_api)

    # 6) sign the CID + meta
    signed = sign_payload(private_key_hex, cid, round_num, num_examples, quality)

    # 7) build JSON payload to send to aggregator (or aggregator will fetch from client)
    payload = {
        "cid": cid,
        "sha256": file_sha256,
        "round": round_num,
        "num_examples": num_examples,
        "quality": quality,
        "submitter": signed["address"],
        "message": signed["message"],
        "signature": signed["signature"]
    }

    # 8) Save manifest.json locally
    manifest_path = os.path.join(artifact_dir, f"manifest_round{round_num}_{num_examples}.json")
    with open(manifest_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Manifest written to: {manifest_path}")

    # print and return for demonstration
    print("Client payload ready:", json.dumps(payload, indent=2))
    return payload

# ---------------------
# Example usage (simulate)
# ---------------------
if __name__ == "__main__":
    class TinyNet(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.fc = torch.nn.Linear(1,1)
        def forward(self,x): return self.fc(x)

    # Load global model from .npz file
    global_model_path = os.getenv("GLOBAL_MODEL_PATH", "aggregated/global_model_round1.npz")
    global_model = load_model_from_npz(global_model_path, TinyNet)

    # Simulate training local model
    local_model = TinyNet()
    with torch.no_grad():
        local_model.fc.weight += torch.randn_like(local_model.fc.weight) * 0.05
        local_model.fc.bias += torch.randn_like(local_model.fc.bias) * 0.02

    # Load private key for signing
    test_priv = os.getenv("TEST_PRIVATE_KEY") 

    run_client_workflow(global_model, local_model, test_priv, round_num=1, num_examples=100, quality=250)

