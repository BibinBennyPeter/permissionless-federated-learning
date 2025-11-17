# Permissionless Federated Learning

Permissionless Federated Learning (PFL) is an end-to-end system that combines **federated learning**, **IPFS**, and **Ethereum smart contracts**.  
Clients locally train on their own data, produce **DP-noised model deltas** as `.npz` files, upload them to **IPFS**, and submit signed metadata to a backend.  
A Python **aggregator** performs **weighted FedAvg** over deltas, pushes the new global model to IPFS, and a **Model Registry** on Ethereum stores model metadata, quality, DP parameters, contributors, rewards, and optional NFTs.

---

## Table of Contents

1. [High-Level Overview](#high-level-overview)  
2. [Architecture](#architecture)  
3. [Workflow](#workflow)  
4. [Folder Structure](#folder-structure)  
5. [Installation & Setup](#installation--setup)  
6. [Environment Variables](#environment-variables)  
7. [Client Workflow](#client-workflow-backendclientclientsubmitpy)  
8. [Aggregator Workflow](#aggregator-workflow-backendaggregatoraggregatepy)  
9. [Smart Contracts](#smart-contracts)  
10. [API Endpoints](#api-endpoints-apiserverjs)  
11. [Frontend Overview](#frontend-overview)  
12. [IPFS Notes](#ipfs-notes)  
13. [Troubleshooting](#troubleshooting)  
14. [Next Steps / Roadmap](#next-steps--roadmap)

---

## High-Level Overview

PFL implements **permissionless federated learning** where:

- Clients download the current **global model** and train locally.
- They generate **differentially private, clipped deltas** and serialize them as `.npz`.
- Deltas are uploaded to **IPFS**, and a signed payload is sent to a backend.
- A Python **aggregator** performs **weighted FedAvg** and uploads the new global model + manifest to IPFS.
- An **Ethereum Model Registry** contract records model CIDs, metadata, quality, privacy parameters, contributors, and distributes reward tokens.
- A **React + TypeScript + Tailwind** frontend lets users:
  - Connect via MetaMask
  - View global models on-chain
  - Upload new deltas
  - See token rewards and contributor lists.

---

## Architecture

### Major Components & Responsibilities

#### 1. Client (`backend/client/client_submit.py`)

- Computes **model delta**: `delta = local - global` (per parameter tensor).
- Applies **L2 clipping + Gaussian noise** for DP:
  - Flatten, clip to `clip_norm`, then add Gaussian noise (`sigma * clip_norm`).
- Saves delta as a compressed `.npz` file.
- Computes **SHA-256** over the artifact bytes and derives a `bytes32` commit hash.
- Uploads the artifact to **IPFS** via HTTP API.
- Signs a canonical message with an Ethereum key using `eth-account`:

  ```text
  <cid>|round:<round>|examples:<n>|quality:<q>
  ```
 - Produces:

  * An **aggregator payload** (`manifest_round...json`) to send to the backend.
  * A **commit payload** (`commit_payload_round...json`) for the frontend / scripts to submit to the blockchain.

#### 2. Backend API (`api/server.js`)

Express server that coordinates submissions and aggregation:

* `GET /global`

  * Returns metadata about the latest global model (file name, CID, SHA-256, round, contributors, quality, DP ε).
* `POST /upload-delta`

  * Accepts a `.npz` model delta (`multipart/form-data` field `file`).
  * Uploads it to **IPFS** (`IPFS_API`).
  * Moves the file into `artifacts/submissions`.
  * Returns the delta’s IPFS CID.
* `POST /submit-payload`

  * Accepts a JSON payload describing a submission (see [Client Workflow](#client-workflow-backendclientclientsubmitpy)).
  * Verifies the **Ethereum signature** with `ethers.utils.verifyMessage`.
  * Verifies the **canonical message string**.
  * Persists the manifest as `manifest_round<round>_<timestamp>_<submitter>.json`.
* `POST /aggregate`

  * Verifies there are submission manifests for the given `round`.
  * Runs the Python aggregator:

    ```bash
    python3 aggregator/aggregate.py --round <round>
    ```
  * Reports the aggregation stdout and number of submissions processed.

#### 3. Aggregator (`backend/aggregator/aggregate.py`)

* Reads a **manifest directory** for JSON submission files.
* Filters submissions by `round`.
* Optionally verifies signatures using `verify_signature`.
* Fetches per-client `.npz` deltas from IPFS.
* Uses **weighted FedAvg** with weight = `num_examples`.
* Writes:

  * `global_model_round<round>.npz` – aggregated model.
  * `global_model_round<round>_manifest.json` – combined manifest (array of submissions).
* Uploads both model and manifest to IPFS and returns:

  * `model_cid`, `model_sha256`
  * `manifest_cid`
  * `contributors[]`
  * `quality_score` (sum over submissions)
  * `dp_epsilon` (fixed constant, e.g. 5).

#### 4. Blockchain Contracts (`blockchain/contracts/`)

* **`ModelRegistry.sol`**

  * Stores **commits** and **published models**, and integrates reward distribution.
  * Core responsibilities:

    * `registerRoundCommit(bytes32 commitHash, uint256 roundId)`

      * Direct commit registration by contributor (msg.sender becomes `contributor`).
      * Enforces `commitHash` uniqueness.
    * `registerRoundCommits(...)`

      * Batch commit registration for a relayer (up to 100 entries).
    * `publishModel(...)`

      * Stores:

        * `ipfsCID`, `metadataHash`
        * `qualityScore`, `dpEpsilon`
        * `contributors[]`, `rewards[]`
        * `roundId`, timestamps, publisher
      * Mints reward tokens via `RewardToken.mint` for each contributor.
    * `linkNFT(modelId, nftContract, tokenId)`

      * Links a model to a model NFT.
    * Read helpers:

      * `getModel`, `getCommit`, `getContributorRewards`,
      * `totalModels()`, `totalCommits()`.
* **`RewardToken.sol`**

  * ERC-20 with:

    * `MINTER_ROLE` – e.g. `ModelRegistry`.
    * `PAUSER_ROLE` – for pausing transfers.
    * Optional `maxSupply` cap (0 = uncapped).
  * `mint(address to, uint256 amount)` – used by the registry to issue rewards.
* **`ModelNFT.sol`**

  * ERC-721 NFT with ERC2981 for royalties.
  * Represents **published models** on-chain.
  * `mintModelNFT(to, modelId, tokenURI, royaltyReceiver, royaltyBps)`:

    * Callable by `modelRegistry` or addresses with `PUBLISHER_ROLE`.
    * Ensures `modelId` is valid via `totalModels()`.
    * Associates a unique token ID with the model ID.
    * Sets royalty information.

#### 5. Frontend (React + TypeScript + Tailwind) (`frontend/`)

Key capabilities:

* Connects to Ethereum via **MetaMask** (`ethers.BrowserProvider`).
* Reads model metadata from `ModelRegistry`.
* Displays global models, contributors, and rewards.
* Lets contributors upload `.npz` deltas and sign the canonical message.
* Calls:

  * Backend: `/upload-delta`, `/submit-payload`.
  * Smart contract: `registerRoundCommit(commitHash, round)`.

Core components:

* `Header.tsx` – wallet connect UI and app header.
* `GlobalModelViewer.tsx` – main on-chain model browser + upload delta workflow.
* `TokenBalance.tsx` – displays the connected wallet’s balance of the configured ERC-20 rewards token.

---

## Architecture Diagram (Text-Based)

```text
                   ┌─────────────────────────┐
                   │   Global Model (npz)    │
                   │  IPFS + local cache     │
                   └──────────┬──────────────┘
                              │
                              │ download
                              ▼
                     ┌─────────────────┐
                     │     Client      │
                     │ (local training)│
                     └─────────────────┘
                              │
             local train      │ compute delta = local - global
                              ▼
                     ┌─────────────────┐
                     │   Delta + DP    │
                     │ clip + noise    │
                     └─────────────────┘
                              │
                              │ save delta_roundX.npz
                              │ upload to IPFS
                              ▼
                      ┌────────────────┐
                      │     IPFS       │
                      │ (CID for npz)  │
                      └──────┬─────────┘
                             │
                             │ build canonical message
                             │ sign with Ethereum key
                             ▼
                    ┌──────────────────────┐
                    │ Backend API (Node)  │
                    │ /upload-delta       │
                    │ /submit-payload     │
                    └─────────┬───────────┘
                              │
                              │ persist manifest_roundX*.json
                              │
                              ▼
                     ┌─────────────────────┐
                     │ Aggregator (Python) │
                     │ weighted FedAvg     │
                     └─────────┬───────────┘
                               │
                               │ fetch npz from IPFS
                               │ produce global_model_roundX.npz
                               │ upload global model + manifest to IPFS
                               ▼
             ┌─────────────────────────────────────┐
             │   IPFS (Global Model & Manifest)    │
             └────────────────┬────────────────────┘
                              │
                              │ relayer publishes
                              ▼
           ┌─────────────────────────────────────────┐
           │    Ethereum: ModelRegistry + Tokens     │
           │  - registerRoundCommit() per contributor│
           │  - publishModel() with quality, dp, CID │
           │  - mint RewardToken to contributors     │
           │  - optional ModelNFT mint + link        │
           └────────────────┬────────────────────────┘
                            │
                            │ read-only (frontend)
                            ▼
           ┌─────────────────────────────────────────┐
           │    Frontend (React + TS + Tailwind)     │
           │  - List global models                   │
           │  - Upload deltas & sign messages        │
           │  - Commit to chain via MetaMask         │
           │  - Show rewards & token balances        │
           └─────────────────────────────────────────┘
```

---

## Folder Structure

```text
frontend/
  public/
  src/
    components/
      GlobalModelViewer.tsx    # main on-chain models browser + upload flow
      Header.tsx               # wallet connect & app title
      TokenBalance.tsx         # shows ERC-20 reward token balance
    App.tsx                    # root app, wires components + wallet
    index.css
    main.tsx                   # React entry (Vite)

backend/
  aggregator/
    aggregate.py               # core weighted FedAvg + IPFS aggregator
  client/
    client_submit.py           # sample client DP workflow + payload generation
  utils/
    __init__.py
    helpers.py                 # IPFS, hashing, FedAvg, Merkle, signing, npz helpers
  .dockerignore
  .gitignore
  Dockerfile                   # containerization for backend services

api/
  server.js                    # Express API: /global, /upload-delta, /submit-payload, /aggregate

blockchain/
  contracts/
    ModelNFT.sol               # ERC721 for model NFTs
    ModelRegistry.sol          # commits + models + rewards + NFT linking
    RewardToken.sol            # ERC20 reward token
  scripts/
    deploy.js                  # deploys contracts + publishes demo models + writes .env
    deployContracts.js         # extended demo script (with distributor / Merkle, etc.)
```

---

## Installation & Setup

### Prerequisites

* **Node.js** (18+ recommended)
* **npm** / **pnpm** / **yarn**
* **Python 3.9+** with `pip` and `virtualenv`
* **IPFS** (go-ipfs) with `ipfs` CLI
* **Hardhat** (via `npx hardhat`)
* Local Ethereum node at `http://127.0.0.1:8545` (Hardhat node or equivalent)

---

### 1. Clone and Install

```bash
git clone <this-repo-url> pfl-permissionless
cd pfl-permissionless
```

Install frontend dependencies:

```bash
cd frontend
npm install        # or pnpm install / yarn
cd ..
```

Backend + API dependencies (example):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

cd api
npm install        # Express, multer, node-fetch, ethers, etc.
cd ..
```

---

### 2. Run IPFS Daemon

```bash
ipfs init   # once
ipfs daemon
```

Expected defaults:

* API: `http://127.0.0.1:5001/api/v0/add`
* Gateway: `http://127.0.0.1:8080`

---

### 3. Start Hardhat Node & Deploy Contracts

From `blockchain/`:

```bash
cd blockchain
npm install
npx hardhat node
```

In another terminal:

```bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```

`deploy.js` will:

* Deploy **RewardToken**, **ModelRegistry**, **ModelNFT**.
* Grant roles (`MINTER_ROLE`, `RELAYER_ROLE`, `PUBLISHER_ROLE`).
* Publish several **demo models**.
* Write addresses to:

  * `blockchain/.env`
  * `frontend/.env` with `VITE_`-prefixed variables.

You’ll see something like:

```env
# blockchain/.env
REWARD_TOKEN_ADDRESS=0x...
MODEL_REGISTRY_ADDRESS=0x...
MODEL_NFT_ADDRESS=0x...
AGGREGATOR_ADDRESS=0x...

# frontend/.env
VITE_REWARD_TOKEN_ADDRESS=0x...
VITE_MODEL_REGISTRY_ADDRESS=0x...
VITE_MODEL_NFT_ADDRESS=0x...
VITE_AGGREGATOR_ADDRESS=0x...
VITE_RPC_URL=http://127.0.0.1:8545
VITE_IPFS_GATEWAY=http://127.0.0.1:8080
```

For the `TokenBalance` component, you should also define:

```env
VITE_TOKEN_ADDRESS=<same-as-VITE_REWARD_TOKEN_ADDRESS>
```

---

### 4. Start the Backend API

From `api/`:

```bash
cd api
PORT=3001 IPFS_API=http://127.0.0.1:5001/api/v0/add node server.js
```

This exposes:

* `GET /global`
* `POST /upload-delta`
* `POST /submit-payload`
* `POST /aggregate`

---

### 5. Run the Aggregator Manually (Optional)

Although typically called via `/aggregate`, you can run it directly:

```bash
cd backend
source .venv/bin/activate
python aggregator/aggregate.py --round 1
```

This will produce aggregated artifacts in `backend/aggregated/`.

---

### 6. Run the Frontend (Vite)

From `frontend/`:

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite (e.g. `http://127.0.0.1:5173`) in a browser with MetaMask.

---

## Environment Variables

Use `.env` files at:

* `frontend/.env`
* `blockchain/.env`
* Optional for backend/API (e.g. `api/.env`, `backend/.env`)

### `.env.example`

```env
# --- IPFS (shared) ---
IPFS_API=http://127.0.0.1:5001/api/v0/add
IPFS_GATEWAY=http://127.0.0.1:8080

# --- Backend / Aggregator ---
PORT=3001
VERIFY_SUBMISSION_SIGNATURES=1       # aggregator signature checks
UPLOAD_MANIFEST=1                    # upload combined manifest to IPFS
TEST_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
GLOBAL_MODEL_PATH=aggregated/global_model_round1.npz

# --- Blockchain ---
REWARD_TOKEN_ADDRESS=0x...
MODEL_REGISTRY_ADDRESS=0x...
MODEL_NFT_ADDRESS=0x...
AGGREGATOR_ADDRESS=0x...

# --- Frontend (Vite) ---
VITE_RPC_URL=http://127.0.0.1:8545
VITE_IPFS_GATEWAY=http://127.0.0.1:8080

# Addresses wired in by deploy.js
VITE_REWARD_TOKEN_ADDRESS=0x...
VITE_MODEL_REGISTRY_ADDRESS=0x...
VITE_MODEL_NFT_ADDRESS=0x...
VITE_AGGREGATOR_ADDRESS=0x...

# TokenBalance component:
# Usually set this equal to VITE_REWARD_TOKEN_ADDRESS
VITE_TOKEN_ADDRESS=0x...
```

---

## Client Workflow (`backend/client/client_submit.py`)

The **client pipeline** illustrates a typical contributor’s flow.

### Steps

1. **Load global and local models**

   * Global: from `.npz` via `load_model_from_npz(npz_path, model_class)`.
   * Local: same architecture, trained on user data.

2. **Compute delta**

   ```python
   global_state = global_model.state_dict()
   local_state = local_model.state_dict()
   delta = compute_delta(global_state, local_state)
   ```

3. **Clip and add DP noise**

   ```python
   delta_noised = clip_and_noise_delta(delta, clip_norm=1.0, sigma=0.5)
   ```

4. **Save artifact**

   ```python
   artifact_path = f"artifacts/delta_round{round_num}_{num_examples}.npz"
   save_delta_npz(delta_noised, artifact_path)
   ```

5. **Compute SHA-256 and commit hash**

   ```python
   with open(artifact_path, "rb") as f:
       file_bytes = f.read()
   file_sha256 = sha256_bytes(file_bytes)        # hex string
   commit_hash = sha256_to_bytes32(file_sha256)  # 0x-prefixed bytes32
   ```

6. **Upload to IPFS**

   ```python
   ipfs_api = os.getenv("IPFS_API", "http://127.0.0.1:5001/api/v0/add")
   cid = upload_to_ipfs(artifact_path, ipfs_api)
   ```

7. **Sign canonical message**

   Canonical format:

   ```text
   <cid>|round:<round>|examples:<num_examples>|quality:<quality>
   ```

   Code:

   ```python
   signed = sign_payload(private_key_hex, cid, round_num, num_examples, quality)
   # { "address", "message", "signature" }
   ```

8. **Aggregator payload (for backend)**

   ```python
   payload = {
       "cid": cid,
       "sha256": file_sha256,
       "round": round_num,
       "num_examples": num_examples,
       "quality": quality,
       "submitter": signed["address"],
       "message": signed["message"],
       "signature": signed["signature"],
   }
   ```

   Saved to `artifacts/manifest_round<round>_<num_examples>.json`.

9. **Commit payload (for on-chain)**

   ```python
   commit_payload = {
       "commitHash": commit_hash,
       "cid": cid,
       "round": round_num,
       "sha256": file_sha256,
       "submitter": signed["address"],
       "signature": signed["signature"],
       "message": signed["message"],
       "num_examples": num_examples,
       "quality": quality,
   }
   ```

   Saved to `artifacts/commit_payload_round<round>_<num_examples>.json`.

   Frontend / scripts can use this to call:

   ```ts
   modelRegistry.registerRoundCommit(commitHash, roundId);
   ```

---

## Aggregator Workflow (`backend/aggregator/aggregate.py`)

The aggregator performs **per-round weighted FedAvg** over DP-noised deltas.

### Input

* JSON submission manifests for a given round:

  ```json
  {
    "cid": "Qm...",
    "sha256": "abc123...",
    "round": 1,
    "num_examples": 100,
    "quality": 250,
    "submitter": "0xContributor",
    "message": "Qm...|round:1|examples:100|quality:250",
    "signature": "0x..."
  }
  ```

### Steps

1. **Collect manifests**

   ```python
   files = sorted(p for p in manifest_dir.iterdir() if p.suffix.lower() == ".json")
   submissions = [...]
   ```

2. **Validate payload shape + signatures**

   * Required keys set.
   * If `VERIFY_SUBMISSION_SIGNATURES=1`, call `verify_signature(message, signature, submitter)`.

3. **Fetch and parse deltas**

   ```python
   npz_bytes = fetch_from_ipfs(cid)
   delta = load_npz_from_bytes(npz_bytes)
   items.append((delta, num_examples))
   ```

4. **Weighted FedAvg**

   ```python
   agg_delta = weighted_fedavg(items)
   ```

5. **Save aggregated model**

   ```python
   global_model_path = out_dir / f"global_model_round{round_number}.npz"
   save_npz_dict(agg_delta, str(global_model_path))
   ```

6. **Hash + upload model**

   ```python
   model_sha256 = sha256_bytes(global_model_path.read_bytes())
   model_cid = upload_to_ipfs(str(global_model_path))
   ```

7. **Save + (optionally) upload combined manifest**

   ```python
   manifest_out = out_dir / f"global_model_round{round_number}_manifest.json"
   save_json(submissions, manifest_out)
   manifest_cid = upload_to_ipfs(str(manifest_out))  # if UPLOAD_MANIFEST=1
   ```

8. **Return metadata**

   ```python
   result = {
       "round": round_number,
       "model_local_path": str(global_model_path),
       "model_sha256": model_sha256,
       "model_cid": model_cid,
       "manifest_local_path": str(manifest_out),
       "manifest_cid": manifest_cid,
       "num_submissions": len(submissions),
       "contributors": [entry["submitter"] for entry in submissions],
       "quality_score": sum(int(entry["quality"]) for entry in submissions),
       "dp_epsilon": 5,
   }
   ```

---

## Smart Contracts

### ModelRegistry.sol

**Roles**

* `DEFAULT_ADMIN_ROLE` – admin.
* `RELAYER_ROLE` – relayer/aggregator:

  * `registerRoundCommits(...)`
  * `publishModel(...)`
  * `linkNFT(...)`.

**Core Structures**

* `Commit`:

  * `commitHash`, `contributor`, `roundId`, `timestamp`.
* `Model`:

  * `modelId`, `ipfsCID`, `metadataHash`
  * `qualityScore`, `dpEpsilon`
  * `contributors[]`, `rewards[]`
  * `publishTimestamp`, `publisher`, `roundId`.

**Key Functions**

* `registerRoundCommit(bytes32 commitHash, uint256 roundId)`
* `registerRoundCommits(bytes32[] commitHashes, uint256[] roundIds, address[] contributors)`
* `publishModel(string ipfsCID, bytes32 metadataHash, uint256 qualityScore, uint256 dpEpsilon, address[] contributors, uint256[] rewardAmounts, uint256 roundId)`
* `linkNFT(uint256 modelId, address nftContract, uint256 tokenId)`
* `getModel`, `getCommit`, `getContributorRewards`, `totalModels`, `totalCommits`.

### RewardToken.sol

* Standard ERC20 with:

  * `mint(address to, uint256 amount)` (only `MINTER_ROLE`).
  * `pause()` / `unpause()` (only `PAUSER_ROLE`).
  * `maxSupply` optional cap.
* `_update` is overridden to enforce paused state on transfers.

### ModelNFT.sol

* ERC721 + ERC2981 + AccessControl.
* `mintModelNFT(to, modelId, tokenURI, royaltyReceiver, royaltyBps)`:

  * Can be called by `modelRegistry` or addresses with `PUBLISHER_ROLE`.
  * Associates a single NFT with a model (`modelIdByToken`, `tokenIdByModel`).
  * Sets royalties (capped by `MAX_ROYALTY_BPS`).

---

## API Endpoints (`api/server.js`)

Base URL: `http://localhost:3001`.

### `GET /global`

**Description:**
Returns latest global model information.

**Example Response:**

```json
{
  "ok": true,
  "model_file": "global_model_round1.npz",
  "cid": "QmGlobalModel",
  "sha256": "abc123...",
  "round": 1,
  "contributors": ["0x...", "0x..."],
  "quality_score": 500,
  "dp_epsilon": 5
}
```

---

### `POST /upload-delta`

**Description:**
Upload `.npz` model delta, forward it to IPFS.

**Request (multipart/form-data):**

* Field `file`: `.npz` file.

**Example:**

```bash
curl -F "file=@delta_round1_100.npz" http://localhost:3001/upload-delta
```

**Response:**

```json
{ "ok": true, "cid": "Qm..." }
```

---

### `POST /submit-payload`

**Description:**
Submit signed metadata describing a delta stored on IPFS.

**Request Body:**

```json
{
  "cid": "QmDeltaCID",
  "sha256": "abc123...",
  "round": 1,
  "num_examples": 100,
  "quality": 250,
  "submitter": "0xContributor",
  "message": "QmDeltaCID|round:1|examples:100|quality:250",
  "signature": "0x..."
}
```

Validation requirements:

* All keys present.
* Signature matches message and `submitter`.
* Message is canonical:

  ```text
  <cid>|round:<round>|examples:<num_examples>|quality:<quality>
  ```

On success:

```json
{ "ok": true, "saved": "/path/to/manifest_round1_..." }
```

---

### `POST /aggregate`

**Description:**
Trigger aggregation for the given round.

**Request Body:**

```json
{ "round": 1 }
```

**Response:**

```json
{
  "ok": true,
  "out": "...stdout from python...",
  "round": 1,
  "submissions_count": 3
}
```

---

## Frontend Overview

Entry: `frontend/src/App.tsx`.

### Header (`Header.tsx`)

* Manages MetaMask connection using `ethers.BrowserProvider`.
* On load, checks if wallet is already connected.
* `connectWallet`:

  * Requests accounts via `eth_requestAccounts`.
  * Obtains `signer` and address.
  * Calls `onWalletConnect(address, signer)`.

### GlobalModelViewer (`GlobalModelViewer.tsx`)

Core UI for models and submissions:

* Initializes `ModelRegistry` contract using:

  * `VITE_MODEL_REGISTRY_ADDRESS`
  * `VITE_RPC_URL`
* Subscribes to:

  * `ModelPublished`
  * `BatchCommitsRegistered`
    to keep list fresh.
* Pagination:

  * Uses `totalModels()` to compute pages.
  * Fetches models via `getModel(i)`.

Each model row shows:

* **Round ID**
* **IPFS CID** (truncated, with open and copy actions)
* **Quality** (`qualityScore / 100`, displayed as `%`)
* **DP ε** (`dpEpsilon / 100`)
* **Contributors count**
* **Published date/time (UTC)**

Details pane (selected model) includes:

* Full CID and metadata hash (with copy).
* Publisher address.
* Quality + DP ε cards.
* Contributors list with per-contributor reward (`RewardToken` balance for that model in RWD units).
* Total rewards for the model.

#### Upload Delta Modal

Trigger: “Upload Delta for Next Round” button.

`handleUploadDelta(file, numExamples, quality, round)`:

1. **Upload delta** (to backend → IPFS):

   ```ts
   const formData = new FormData();
   formData.append('file', file);
   const { cid } = await (await fetch('/upload-delta', { method: 'POST', body: formData })).json();
   ```

2. **Sign canonical message with MetaMask**:

   ```ts
   const message = `${cid}|round:${round}|examples:${numExamples}|quality:${quality}`;
   const signature = await signer.signMessage(message);
   ```

3. **Compute pseudo sha256 (keccak of CID)**:

   ```ts
   const sha256 = ethers.keccak256(ethers.toUtf8Bytes(cid)).slice(0, 66);
   ```

4. **Submit manifest to backend**:

   ```ts
   await fetch('/submit-payload', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ cid, sha256, round, num_examples: numExamples, quality, submitter: address, message, signature })
   });
   ```

5. **Register commit on-chain** (if contract is available):

   ```ts
   const commitHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
   const contractWithSigner = contract.connect(signer);
   const tx = await contractWithSigner.registerRoundCommit(commitHash, round);
   await tx.wait();
   ```

### TokenBalance (`TokenBalance.tsx`)

Displays the connected wallet’s token balance in a small card at the top of the app.

* Looks up token address from:

  ```ts
  const tokenAddress = import.meta.env.VITE_TOKEN_ADDRESS;
  ```

* If `VITE_TOKEN_ADDRESS` is defined:

  * Instantiates an ERC20 contract with a minimal ABI:

    * `balanceOf(address)`
    * `decimals()`
    * `symbol()`
  * Fetches:

    * `balance = balanceOf(walletAddress)`
    * `decimals`
    * `symbol`
  * Formats the balance using `ethers.formatUnits(rawBalance, decimals)`.

* If `VITE_TOKEN_ADDRESS` is **not** set:

  * Falls back to **ETH balance** using the signer’s provider:

    * `provider.getBalance(walletAddress)`
    * Displays value formatted via `ethers.formatEther(...)`, using symbol `ETH`.

The component also provides a **Refresh** button to re-fetch the balance.

---

## IPFS Notes

### Storing Files

Both Python and Node use the IPFS HTTP API at `IPFS_API`:

* Python:

  ```python
  with open(path, "rb") as f:
      files = {"file": (os.path.basename(path), f)}
      resp = requests.post(IPFS_API, files=files, timeout=60)
  # parse last JSON line to get Hash
  ```

* Node:

  ```js
  const fd = new formData();
  fd.append("file", fs.createReadStream(filePath));
  const res = await fetch(IPFS_API, { method: "POST", body: fd });
  const lastLine = res.text().trim().split("\n").pop();
  const cid = JSON.parse(lastLine).Hash;
  ```

Some IPFS versions output newline-delimited JSON; this is why the “last line” parsing pattern is used.

### Loading `.npz` from IPFS

* Aggregator uses `fetch_from_ipfs(cid)` which hits `IPFS_GATEWAY` and returns raw bytes.
* `load_npz_from_bytes` wraps bytes in `BytesIO` and calls `numpy.load` (with `allow_pickle=False`) to reconstruct the arrays.

### Gateway Access

Models and manifests can be opened in a browser:

```text
http://127.0.0.1:8080/ipfs/<CID>
```

---

## Troubleshooting

### IPFS Issues

**Symptoms:**

* Upload endpoints fail.
* “Failed to parse IPFS add response”.

**Checklist:**

* Ensure `ipfs daemon` is running.
* Confirm `IPFS_API` and `IPFS_GATEWAY` URLs.
* Inspect raw `curl` response from `IPFS_API` and ensure JSON contains `"Hash"`.

### `.npz` / NumPy / Torch Errors

**Symptoms:**

* Aggregator logs `failed to parse npz from CID`.

**Checklist:**

* Confirm that client uses consistent dtype (`float32`) and contiguous arrays.
* Ensure keys in `.npz` match model’s `state_dict()` keys.
* Check NumPy version compatibility.

### Hardhat / Hashing Issues

**Symptoms:**

* Commit hashes don’t match between JS and Solidity.
* Merkle proofs fail in extended scripts.

**Checklist:**

* Use `ethers.keccak256(ethers.toUtf8Bytes(...))` consistently.
* When computing Merkle leaves, mirror Solidity’s `abi.encodePacked` via:

  * `ethers.solidityPackedKeccak256(["uint256","address","uint256"], [index, addr, amount])`.

### Signature / Canonical Message Problems

**Symptoms:**

* `/submit-payload` returns `signature mismatch` or `message not canonical`.

**Checklist:**

* Ensure the message exactly matches:

  ```text
  <cid>|round:<round>|examples:<num_examples>|quality:<quality>
  ```

* No extra whitespace, different order, or formatting changes.

* Use the same numbers in both the message and JSON payload.

### JSON Canonicalization

If you compute hashes over JSON metadata, prefer:

```python
json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
```

to avoid whitespace altering hashes.

### Frontend / Provider Issues

**Symptoms:**

* No models appear.
* Errors connecting to RPC.

**Checklist:**

* Check that Hardhat node (or your RPC) is running.
* Ensure `VITE_RPC_URL` matches the network MetaMask is connected to.
* Confirm contract addresses (`VITE_MODEL_REGISTRY_ADDRESS`, etc.) are correct and redeployed as needed.

---

## Next Steps / Roadmap

Potential extensions:

1. **Deeper NFT + Marketplace Integration**

   * Auto-mint `ModelNFT` on `publishModel`.
   * UI for browsing, trading, and showcasing model NFTs.

2. **More Sophisticated Reward Logic**

   * Weighted rewards based on contribution quality, reputation, or stake.
   * Optional off-chain or on-chain reward distributors with Merkle proofs.

3. **Validator / Relayer Network**

   * Multiple aggregators / relayers with consensus on global model updates.
   * Slashing or penalties for incorrect aggregation.

4. **Better UX and Analytics**

   * Visualization of round-by-round performance gains.
   * DP budget tracking (ε usage over time).
   * Contributor dashboards (rewards history, rounds participated).

5. **Security & Robustness**

   * Additional checks on file sizes and shapes before aggregation.
   * More extensive monitoring/logging of aggregation runs.
   * Hardening signature and canonicalization rules as a formal spec.

6. **Productionization**

   * Container orchestration (Kubernetes) for aggregator and API.
   * Off-chain job queue for aggregation (e.g., Celery, BullMQ).
   * Real-world model architectures and datasets.

---
