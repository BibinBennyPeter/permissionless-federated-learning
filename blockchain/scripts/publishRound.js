require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");
const crypto = require("crypto");

async function main() {
  const registryAddress = process.env.MODEL_REGISTRY;
  const roundNumber = Number(process.env.ROUND || 1);
  const aggregatedDir = path.join(__dirname, "../../backend/aggregated");
  const manifestPath = path.join(aggregatedDir, `manifest_round${roundNumber}.json`);
  const modelPath = path.join(aggregatedDir, `global_model_round${roundNumber}.npz`);

  if (!fs.existsSync(manifestPath) || !fs.existsSync(modelPath)) {
    throw new Error("Missing manifest or model file. Ensure aggregation has completed.");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Compute Merkle root
  const leaves = manifest.map((entry) => {
    const leafStr = `${entry.cid}|round:${entry.round}|examples:${entry.num_examples}|quality:${entry.quality}|submitter:${entry.submitter}`;
    return keccak256(leafStr);
  });
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const merkleRoot = tree.getHexRoot();

  // Compute SHA256 hash of the model file
  const modelBytes = fs.readFileSync(modelPath);
  const modelHash = crypto.createHash("sha256").update(modelBytes).digest("hex");

  // Read manifest CID from optional metadata (or provide it as an override)
  const manifestCid = process.env.MANIFEST_CID || manifest[0].cid;

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("ModelRegistry", registryAddress, signer);

  const roleId = ethers.id("AGGREGATOR_ROLE");
  const hasRole = await registry.hasRole(roleId, signer.address);
  if (!hasRole) {
    console.warn("Signer lacks AGGREGATOR_ROLE. Transaction may revert.");
  }

  // Format values properly for Solidity (bytes32 and string)
  const tx = await registry.publishRound(
    roundNumber,
    merkleRoot,
    manifestCid,
    "0x" + modelHash
  );

  console.log("tx hash:", tx.hash);
  await tx.wait();
  console.log("Round published!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
