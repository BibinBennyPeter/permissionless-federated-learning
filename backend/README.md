# Permissionless Federated Learning — Backend

This repository contains the backend prototype for **Permissionless Federated Learning**:
a Flower (flwr) + PyTorch prototype that demonstrates a federated learning server + simulated clients, with planned integration to a blockchain-based aggregator for verifiable submissions and reward distribution.

---

## What’s here (backend-only)
- `flwr-app/` — Flower app package
  - `flwr_app/server_app.py` — Flower ServerApp entry
  - `flwr_app/client_app.py` — Flower client implementation (simulated clients)
  - `flwr_app/task.py` — model & dataset helper
  - `pyproject.toml` — Flower project config (simulation parameters)
- `Dockerfile` — image to run the app (Python 3.11)
- `requirements.txt` — minimal Python deps (flwr, web3, etc.)

---

## Why Docker?
During development on Manjaro with host Python 3.13 we encountered incompatible wheel and environment issues (torch/torchvision picking CUDA artifacts, `ModuleNotFoundError` due to package path, Ray errors). Docker ensures a reproducible environment (Python 3.11 + CPU-only PyTorch), avoiding OS-specific wheel / path problems and making the demo portable.

---

## Quick start — run the Flower simulation (recommended)
> Build the image from `backend/` (only needed once or after Dockerfile changes):
```bash
cd backend
docker build -t pfl-flwr-light .
