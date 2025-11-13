"""
backend/aggregator/aggregate.py

- Collects per-client JSON payload files (one file per client submission).
- Filters submissions by `round` field.
- Verifies minimal payload shape (and optionally signatures).
- Fetches each client's .npz from IPFS, loads delta, and computes weighted FedAvg.
- Writes aggregated global model .npz, uploads model + manifest to IPFS (optional).
- Returns result metadata dict.
"""

import os
import sys
import json
from pathlib import Path
import traceback

# Make sure sibling package `utils` (backend/utils) is importable when running this script directly.
# This appends the parent directory of this file (i.e. backend/) to sys.path.
_this_dir = Path(__file__).resolve().parent
_project_root = _this_dir.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from utils.helpers import (
    load_json,
    load_npz_from_bytes,
    fetch_from_ipfs,
    weighted_fedavg,
    save_npz_dict,
    sha256_bytes,
    upload_to_ipfs,
    save_json,
    verify_signature,         # optional verification
)

# -------- config / defaults ----------
DEFAULT_MANIFEST_DIR = str(_project_root / "artifacts")          # client JSONs written here
DEFAULT_OUT_DIR = str(_project_root / "aggregated")
VERIFY_SIGNATURES = os.getenv("VERIFY_SUBMISSION_SIGNATURES", "1") == "1"
IPFS_UPLOAD_MANIFEST = os.getenv("UPLOAD_MANIFEST", "1") == "1"

# -------- main function --------------
def run_aggregation(manifest_dir: str = DEFAULT_MANIFEST_DIR,
                    out_dir: str = DEFAULT_OUT_DIR,
                    round_number: int = 1,
                    upload_manifest: bool = IPFS_UPLOAD_MANIFEST):
    manifest_dir = Path(manifest_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[aggregate] manifest_dir: {manifest_dir}, out_dir: {out_dir}, round: {round_number}")
    if not manifest_dir.exists():
        raise RuntimeError(f"Manifest dir does not exist: {manifest_dir}")

    # collect all json files in manifest_dir
    files = sorted(p for p in manifest_dir.iterdir() if p.suffix.lower() == ".json")
    if not files:
        raise RuntimeError(f"No JSON files found in {manifest_dir}")

    submissions = []
    for f in files:
        try:
            entry = load_json(f)
        except Exception as e:
            print(f"[warn] failed to load JSON {f.name}: {e}")
            continue

        # ensure it is for the requested round
        if entry.get("round") != round_number:
            # skip other-round submissions
            continue

        # basic shape check
        required = {"cid", "sha256", "round", "num_examples", "quality", "submitter", "message", "signature"}
        if not required.issubset(set(entry.keys())):
            print(f"[warn] skipping {f.name} - missing required keys: {required - set(entry.keys())}")
            continue

        # optional signature verification
        if VERIFY_SIGNATURES:
            try:
                ok = verify_signature(entry["message"], entry["signature"], entry["submitter"])
            except Exception:
                ok = False
            if not ok:
                print(f"[warn] signature verification failed for {f.name} (submitter={entry.get('submitter')}) -> skipping")
                continue

        submissions.append(entry)

    if not submissions:
        raise RuntimeError(f"No valid submissions found for round {round_number} in {manifest_dir}")

    print(f"[aggregate] collected {len(submissions)} validated submissions for round {round_number}")

    # load deltas from IPFS and collect weights
    items = []
    for idx, entry in enumerate(submissions):
        cid = entry["cid"]
        num_examples = int(entry["num_examples"])
        try:
            npz_bytes = fetch_from_ipfs(cid)
        except Exception as e:
            print(f"[warn] failed to fetch CID {cid} for submission #{idx}: {e}")
            continue
        try:
            delta = load_npz_from_bytes(npz_bytes)
        except Exception as e:
            print(f"[warn] failed to parse npz from CID {cid}: {e}")
            continue
        items.append((delta, num_examples))

    if not items:
        raise RuntimeError("No successfully fetched/parsed deltas to aggregate.")

    # compute weighted FedAvg (over deltas)
    agg_delta = weighted_fedavg(items)

    # save aggregated model
    global_model_path = out_dir / f"global_model_round{round_number}.npz"
    save_npz_dict(agg_delta, str(global_model_path))
    print(f"[aggregate] saved aggregated model to {global_model_path}")

    # compute sha256 and upload model to IPFS
    model_sha256 = sha256_bytes(global_model_path.read_bytes())
    model_cid = None
    try:
        model_cid = upload_to_ipfs(str(global_model_path))
        print(f"[aggregate] uploaded aggregated model to IPFS CID: {model_cid}")
    except Exception as e:
        print(f"[warn] failed to upload aggregated model to IPFS: {e}")

    # write combined manifest array (the aggregator manifest)
    manifest_out = out_dir / f"global_model"
    save_json(submissions, manifest_out)
    print(f"[aggregate] wrote combined manifest to {manifest_out}")

    manifest_cid = None
    if upload_manifest:
        try:
            manifest_cid = upload_to_ipfs(str(manifest_out))
            print(f"[aggregate] uploaded manifest to IPFS CID: {manifest_cid}")
        except Exception as e:
            print(f"[warn] failed to upload manifest: {e}")

    result = {
        "round": round_number,
        "model_local_path": str(global_model_path),
        "model_sha256": model_sha256,
        "model_cid": model_cid,
        "manifest_local_path": str(manifest_out),
        "manifest_cid": manifest_cid,
        "num_submissions": len(submissions),
    }
    return result

# -------- CLI convenience --------------
if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Aggregate client submissions for a FL round")
    p.add_argument("--manifest-dir", default=DEFAULT_MANIFEST_DIR, help="folder containing per-client JSON submissions")
    p.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="where to save aggregated model and manifest")
    p.add_argument("--round", "-r", type=int, default=1, help="round number to aggregate")
    p.add_argument("--no-verify", dest="verify", action="store_false", help="disable signature verification")
    p.add_argument("--no-upload", dest="upload", action="store_false", help="don't upload manifest to IPFS")
    args = p.parse_args()

    VERIFY_SIGNATURES = args.verify
    result = run_aggregation(args.manifest_dir, args.out_dir, args.round, upload_manifest=args.upload)
    print("\nResult:")
    print(json.dumps(result, indent=2))
