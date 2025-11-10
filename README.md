# Permissionless Federated Learning

A decentralized system for permissionless federated learning using IPFS, Ethereum smart contracts, and differential privacy.

## 🚀 Overview

This project enables clients to collaboratively train a machine learning model without sharing raw data. The architecture combines:

- **Federated Learning (FL)** via PyTorch and FLWR
- **Decentralized Storage** via IPFS
- **Smart Contracts** on Ethereum for submission verification and reward eligibility
- **Differential Privacy** via per-client noise addition
- **Merkle Tree Commitments** for efficient batching and verification

---

## 🗂 Project Structure

```

.
├── backend/
│   ├── aggregator/            # Aggregation + publishing scripts (FedAvg, manifest)
│   ├── artifacts/             # Submission and aggregation artifacts (npz, manifest)
│   ├── flwr-app/              # Client submission logic (delta, DP, IPFS, signature)
│   └── utils/                 # Shared helpers (IPFS, hashing, signature, FL logic)
│
├── blockchain/
│   ├── contracts/             # Solidity smart contracts
│   ├── scripts/               # Deployment and publishing scripts (Hardhat)
│   ├── data/                  # Output model + manifest hash info for publishing
│   └── hardhat.config.js      # Localchain config
│
├── .env                       # API keys, private keys, IPFS config
└── README.md                  # You're here!

````

---

## 🔁 Workflow

1. **Client Local Training**
   - Trains a model locally, computes delta w.r.t. global model
   - Clips and adds noise (DP)
   - Uploads delta to IPFS
   - Signs submission with Ethereum key
   - Generates a manifest JSON

2. **Aggregator**
   - Collects all submissions for the round
   - Fetches deltas from IPFS
   - Computes weighted FedAvg
   - Saves updated global model
   - Uploads new global model to IPFS
   - Creates Merkle root over all submissions
   - Publishes round metadata on-chain

3. **Smart Contract**
   - Stores Merkle root, global model hash, and manifest CID
   - Verifies submissions via Merkle proofs
   - Used for future reward eligibility

---

## ⚙️ Setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
````

### 2. Blockchain

```bash
cd blockchain
npm install
npx hardhat node        # start local testnet
npx hardhat run scripts/deploy.js --network localhost
```

Update `.env` with your deployed contract address and test key.

---

## 📦 Example

### Simulate a client

```bash
python backend/flwr-app/flwr_app/client_submit.py
```

### Run aggregator (FedAvg + IPFS upload)

```bash
python backend/aggregator/run_aggregate.py
```

### Publish round to contract

```bash
npx hardhat run scripts/publishRound.js --network localhost
```

---

## 📌 Notes

* IPFS must be running locally: `ipfs daemon`
* Hardhat provides test private keys; use one in `.env` as `TEST_PRIVATE_KEY`
* Uses `eth_account` for signing, `merkletreejs` for Merkle root generation

---
