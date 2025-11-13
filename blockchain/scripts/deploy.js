const { ethers } = require("hardhat");

function toBn(x) { return ethers.BigNumber.from(x); }

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const aggregator = signers[1];   // will act as the RELAYER / aggregator
  const contributorA = signers[2];
  const contributorB = signers[3];

  console.log("Using deployer:", deployer.address);
  console.log("Aggregator(Relayer):", aggregator.address);
  console.log("ContributorA:", contributorA.address);
  console.log("ContributorB:", contributorB.address);

  // ------------- Deploy contracts -------------
  const RewardToken = await ethers.getContractFactory("RewardToken", deployer);
  const ModelRegistry = await ethers.getContractFactory("ModelRegistry", deployer);
  const ModelNFT = await ethers.getContractFactory("ModelNFT", deployer);
  const RewardDistributor = await ethers.getContractFactory("RewardDistributor", deployer);

  // RewardToken(name, symbol, admin, maxSupply)
  const reward = await RewardToken.deploy("DemoReward", "RWD", deployer.address, 0);
  await reward.waitForDeployment();
  console.log("RewardToken:", reward.target);

  const registry = await ModelRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  console.log("ModelRegistry:", registry.target);

  const nft = await ModelNFT.deploy(registry.target, deployer.address);
  await nft.waitForDeployment();
  console.log("ModelNFT:", nft.target);

  const distributor = await RewardDistributor.deploy(reward.target, deployer.address);
  await distributor.waitForDeployment();
  console.log("RewardDistributor:", distributor.target);

  // ------------- Grant roles to aggregator -------------
  const RELAYER_ROLE = await registry.RELAYER_ROLE();
  await registry.connect(deployer).grantRole(RELAYER_ROLE, aggregator.address);
  console.log("Granted RELAYER_ROLE on ModelRegistry to aggregator");

  const PUBLISHER_ROLE = await nft.PUBLISHER_ROLE();
  await nft.connect(deployer).grantRole(PUBLISHER_ROLE, aggregator.address);
  console.log("Granted PUBLISHER_ROLE on ModelNFT to aggregator");

  const DIST_RELAYER_ROLE = await distributor.RELAYER_ROLE();
  await distributor.connect(deployer).grantRole(DIST_RELAYER_ROLE, aggregator.address);
  console.log("Granted RELAYER_ROLE on RewardDistributor to aggregator");

  // ------------- Mint & fund distributor -------------
  const FUNDING = ethers.parseEther("1000"); // tokens for demo
  await reward.connect(deployer).mint(deployer.address, FUNDING);
  // Transfer tokens to distributor for payouts
  await reward.connect(deployer).transfer(distributor.target, FUNDING);
  console.log("Funded distributor with", FUNDING.toString(), "tokens");

  // ------------- Contributors register commits on-chain themselves -------------
  const commitHashA = ethers.keccak256(ethers.toUtf8Bytes("commitA-data"));
  const commitHashB = ethers.keccak256(ethers.toUtf8Bytes("commitB-data"));
  const roundId = 1;

  // contributorA registers a commit (this makes contributorA the recorded contributor)
  await registry.connect(contributorA).registerRoundCommit(commitHashA, roundId);
  console.log("ContributorA registered commit:", commitHashA);

  // contributorB registers a commit
  await registry.connect(contributorB).registerRoundCommit(commitHashB, roundId);
  console.log("ContributorB registered commit:", commitHashB);

  // ------------- Aggregator aggregates off-chain (simulated) and publishes a new model -------------
  // Off-chain: aggregator runs PyTorch aggregation and pins updated model to IPFS.
  // For demo, we use a fake CID and a metadata hash.
  const ipfsCID = "ipfs://fakeCID-demo-model-v1";
  const metadataHash = ethers.keccak256(ethers.toUtf8Bytes("metadata-json-demo"));
  const qualityScore = 900;
  const dpEpsilon = 5;

  // Build contributors array (addresses that actually contributed)
  const contributors = [contributorA.address, contributorB.address];

  // Aggregator (with RELAYER_ROLE) publishes model
  const txPublish = await registry.connect(aggregator).publishModel(ipfsCID, metadataHash, qualityScore, dpEpsilon, contributors);
  const receipt = await txPublish.wait();
  // Extract modelId from event if you want; modelId is numeric and incremental. For simplicity call totalModels() - 1
  const totalModels = Number(await registry.totalModels());
  const modelId = totalModels - 1;
  console.log("Aggregator published modelId:", modelId, "CID:", ipfsCID);

  // ------------- Aggregator mints an NFT for the model -------------
  const tokenURI = "ipfs://nft-metadata-demo";
  const royaltyReceiver = deployer.address;
  const royaltyBps = 500; // 5%
  const txMint = await nft.connect(aggregator).mintModelNFT(contributorA.address, modelId, tokenURI, royaltyReceiver, royaltyBps);
  const rMint = await txMint.wait();
  // For demo, tokenId will be 1 (since contract uses _nextTokenId = 1)
  const tokenId = 1;
  console.log("Minted ModelNFT tokenId:", tokenId, "for modelId:", modelId);

  // Link the NFT in the registry (optional, matches your design)
  await registry.connect(aggregator).linkNFT(modelId, nft.target, tokenId);
  console.log("Linked NFT to model in registry");

  // ------------- Build a small Merkle tree off-chain for rewards (2 recipients) -------------
  // Leaves must be computed exactly the same way Solidity does:
  // leaf = keccak256(abi.encodePacked(index, account, amount))
  const amountA = ethers.parseEther("100");
  const amountB = ethers.parseEther("200");

  function solidityKeccak(types, values) {
    return ethers.solidityPackedKeccak256(types, values);
  }

  const leaf0 = solidityKeccak(["uint256", "address", "uint256"], [0, contributorA.address, amountA]);
  const leaf1 = solidityKeccak(["uint256", "address", "uint256"], [1, contributorB.address, amountB]);

  // IMPORTANT: use the same "pair hashing" convention as the Solidity verification.
  // We will use the canonical ordering (a <= b ? hash(a||b) : hash(b||a)) as we used in tests.
  function hashPair(a, b) {
    const aBn = BigInt(a);
    const bBn = BigInt(b);
    const left = aBn <= bBn ? a : b;
    const right = aBn <= bBn ? b : a;
    // ethers.concat + keccak256 ensures we hash the raw bytes the same as abi.encodePacked
    return ethers.keccak256(ethers.concat([ethers.getBytes(left), ethers.getBytes(right)]));
  }

  const merkleRoot = hashPair(leaf0, leaf1);
  console.log("Computed Merkle root:", merkleRoot);

  const totalReward = amountA + amountB;

  // Aggregator sets the Merkle root & total reward on-chain (must have funds in distributor; we funded earlier)
  await distributor.connect(aggregator).setDistributionMerkle(modelId, merkleRoot, totalReward);
  console.log("Set distribution merkle for modelId:", modelId, "totalReward:", totalReward.toString());

  // ------------- Contributor B claims its reward (index 1) -------------
  // For 2-leaf tree, contributorB's proof is [leaf0]
  const proofForB = [leaf0];

  // contributorB calls claimMerkle; this costs gas paid by contributorB in a real run
  await distributor.connect(contributorB).claimMerkle(modelId, 1, contributorB.address, amountB, proofForB);
  console.log("ContributorB claimed reward:", amountB.toString(), "balance:", (await reward.balanceOf(contributorB.address)).toString());

  console.log("Demo flow complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
