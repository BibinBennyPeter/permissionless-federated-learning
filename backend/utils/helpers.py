# backend/common/helpers.py
"""
Shared helpers for Permissionless Federated Learning (PFL).
Contains IPFS, hashing, signature, npz, FL helpers, merkle utilities and small I/O helpers.
Drop this file into backend/common/helpers.py and import from other modules as:

    from common.helpers import upload_to_ipfs, fetch_from_ipfs, sign_payload, verify_signature, ...

"""

from pathlib import Path
from io import BytesIO
import os
import json
import hashlib
from typing import List, Dict, Tuple, Any

import numpy as np
import requests
from eth_account import Account
from eth_account.messages import encode_defunct
import torch
from eth_utils import keccak, to_hex

# Defaults (override via environment variables if you want)
IPFS_API_ADD = os.getenv("IPFS_API", "http://127.0.0.1:5001/api/v0/add")
IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "http://127.0.0.1:8080")

# ---------------------
# Hashing / integrity
# ---------------------

def sha256_bytes(b: bytes) -> str:
    """Return lowercase hex SHA-256 of bytes."""
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()

# ---------------------
# IPFS helpers (HTTP API + gateway)
# ---------------------

def upload_to_ipfs(path: str, api_add: str = None) -> str:
    """Upload a file to a local IPFS daemon via /api/v0/add and return its CID (string).

    Uses requests to POST multipart file. Parses the last JSON line returned by some IPFS versions.
    """
    api_add = api_add or IPFS_API_ADD
    with open(path, "rb") as fh:
        files = {"file": (Path(path).name, fh)}
        r = requests.post(api_add, files=files, timeout=120)
    r.raise_for_status()
    last = r.text.strip().splitlines()[-1]
    return json.loads(last)["Hash"]


def fetch_from_ipfs(cid: str, gateway: str = None) -> bytes:
    """Fetch raw bytes for a CID via HTTP gateway (default localhost gateway).

    Example gateway URL: http://127.0.0.1:8080
    Response is the raw file bytes.
    """
    gateway = gateway or IPFS_GATEWAY
    url = f"{gateway.rstrip('/')}/ipfs/{cid}"
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return r.content


def upload_json_to_ipfs(obj: Any, api_add: str = None) -> str:
    """Serialize JSON object and upload to IPFS. Returns CID."""
    api_add = api_add or IPFS_API_ADD
    payload = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    # write to temp file
    tmp = Path("/tmp/pfl_manifest.json")
    tmp.write_bytes(payload)
    cid = upload_to_ipfs(str(tmp), api_add=api_add)
    try:
        tmp.unlink()
    except Exception:
        pass
    return cid

# ---------------------
# Sign / verify (eth-account)
# ---------------------

def sign_payload(private_key_hex: str, cid: str, round_num: int, num_examples: int, quality: int) -> dict:
    """Return signature payload (address, message, signature hex).

    Message format MUST match server verification: "{cid}|round:{round}|examples:{n}|quality:{q}".
    """
    acct = Account.from_key(private_key_hex)
    message = f"{cid}|round:{round_num}|examples:{num_examples}|quality:{quality}"
    msg = encode_defunct(text=message)
    signed = acct.sign_message(msg)
    return {"address": acct.address, "message": message, "signature": signed.signature.hex()}


def verify_signature(message: str, signature_hex: str, expected_address: str) -> bool:
    """Recover address from signature and compare (case-insensitive). Returns True if valid."""
    try:
        msg = encode_defunct(text=message)
        recovered = Account.recover_message(msg, signature=signature_hex)
        return recovered.lower() == expected_address.lower()
    except Exception:
        return False

# ---------------------
# NPZ helpers
# ---------------------

def save_npz_dict(np_dict: Dict[str, np.ndarray], out_path: str):
    """Save dict[str -> numpy.array] to compressed .npz with float32 and contiguous arrays."""
    np.savez_compressed(out_path, **{k: np.ascontiguousarray(np.asarray(v, dtype=np.float32)) for k, v in np_dict.items()})


def load_npz_from_bytes(b: bytes) -> Dict[str, np.ndarray]:
    """Load .npz bytes and return dict of numpy arrays (float32)."""
    bio = BytesIO(b)
    npz = np.load(bio, allow_pickle=False)
    return {k: npz[k].astype(np.float32) for k in npz.files}

# deterministic serialization (useful for local sha256 canonicalization)
def deterministic_state_dict_bytes(state_dict: Dict[str, Any]) -> bytes:
    """Serialize a PyTorch/Torch-like state_dict deterministically to bytes.

    Keys are sorted; each entry encodes key + shape + raw bytes. Use this when you want canonical local sha256.
    """
    parts: List[bytes] = []
    for k in sorted(state_dict.keys()):
        if isinstance(state_dict[k], torch.Tensor):
            arr = state_dict[k].cpu().detach().numpy().astype(np.float32)
        else:
            arr = np.asarray(state_dict[k], dtype=np.float32)
        arr = np.ascontiguousarray(arr)
        parts.append(k.encode("utf-8"))
        parts.append(b"|")
        parts.append(np.array(arr.shape, dtype=np.int64).tobytes())
        parts.append(b"|")
        parts.append(arr.tobytes())
        parts.append(b"\n")
    return b"".join(parts)

# ---------------------
# FL helpers: delta, clip, noise
# ---------------------

def compute_delta(global_state: Dict[str, Any], local_state: Dict[str, Any]) -> Dict[str, np.ndarray]:
    """Return a delta dict: local - global (numpy arrays, float32). Keys must match."""
    delta: Dict[str, np.ndarray] = {}
    for k in global_state.keys():
        g = global_state[k].cpu().detach().numpy().astype(np.float32) if isinstance(global_state[k], torch.Tensor) else np.asarray(global_state[k], dtype=np.float32)
        l = local_state[k].cpu().detach().numpy().astype(np.float32) if isinstance(local_state[k], torch.Tensor) else np.asarray(local_state[k], dtype=np.float32)
        delta[k] = l - g
    return delta


def clip_and_noise_delta(delta: Dict[str, np.ndarray], clip_norm: float = 1.0, sigma: float = 0.5) -> Dict[str, np.ndarray]:
    """L2 clip the flattened delta vector and add Gaussian noise element-wise.

    Returns dict with same keys/shapes containing float32 arrays.
    """
    keys = sorted(delta.keys())
    arrays = [np.ascontiguousarray(delta[k].ravel()) for k in keys]
    flat = np.concatenate(arrays).astype(np.float32)
    norm = np.linalg.norm(flat)
    if norm > clip_norm and norm > 0:
        flat = flat * (clip_norm / norm)
    # gaussian noise with mean 0, std = sigma * clip_norm
    noise = np.random.normal(0.0, sigma * clip_norm, size=flat.shape).astype(np.float32)
    flat_noised = flat + noise
    # unflatten into dict
    out: Dict[str, np.ndarray] = {}
    idx = 0
    for k in keys:
        size = delta[k].size
        out[k] = flat_noised[idx:idx+size].reshape(delta[k].shape)
        idx += size
    return out

# Weighted FedAvg convenience (aggregates deltas or params)
def weighted_fedavg(items: List[Tuple[Dict[str, np.ndarray], int]]) -> Dict[str, np.ndarray]:
    """items: list of (dict_of_arrays, weight=num_examples). Returns aggregated dict.

    Standard weighted average: sum_i w_i * arr_i / sum_i w_i for each key.
    """
    if not items:
        raise ValueError("No items to aggregate")
    keys = sorted(items[0][0].keys())
    total = sum(w for _, w in items)
    agg: Dict[str, np.ndarray] = {}
    for k in keys:
        shape = items[0][0][k].shape
        acc = np.zeros(shape, dtype=np.float32)
        for arr_dict, w in items:
            acc += arr_dict[k].astype(np.float32) * (w / total)
        agg[k] = acc
    return agg

# ---------------------
# Merkle helpers (keccak / canonical leaf)
# ---------------------

def canonical_leaf_str(entry: Dict[str, Any]) -> str:
    """Create canonical leaf string from a submission entry.

    Format MUST match verifier and publisher: <cid>|round:<r>|examples:<n>|quality:<q>|submitter:<addr>
    """
    return f"{entry['cid']}|round:{entry['round']}|examples:{entry['num_examples']}|quality:{entry['quality']}|submitter:{entry['submitter']}"


def leaf_hash_hex(entry: Dict[str, Any]) -> str:
    """Return 0x-prefixed keccak hex of canonical leaf string."""
    s = canonical_leaf_str(entry)
    return to_hex(keccak(text=s))


def merkle_root_from_entries(entries: List[Dict[str, Any]]) -> str:
    """Compute keccak merkle root (pairwise sorted) from list of submission entries.

    Returns 0x-prefixed hex string suitable for on-chain storage.
    """
    if not entries:
        return to_hex(keccak(b""))
    # compute raw node bytes
    nodes = [keccak(text=canonical_leaf_str(e)) for e in entries]
    while len(nodes) > 1:
        next_nodes = []
        for i in range(0, len(nodes), 2):
            a = nodes[i]
            b = nodes[i+1] if i+1 < len(nodes) else nodes[i]
            left, right = (a, b) if a <= b else (b, a)
            next_nodes.append(keccak(left + right))
        nodes = next_nodes
    return to_hex(nodes[0])

# ---------------------
# Small utilities
# ---------------------

def ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)


def save_json(obj: Any, path: str):
    Path(path).write_text(json.dumps(obj, indent=2))


def load_json(path: str) -> Any:
    return json.loads(Path(path).read_text())
