const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(60));
  console.log("DEPLOYING FEDERATED LEARNING CONTRACTS");
  console.log("=".repeat(60));

  // Get signers
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const aggregator = signers[1];
  const contributor1 = signers[2];
  const contributor2 = signers[3];
  const contributor3 = signers[4];

  console.log("\nAccounts:");
  console.log("   Deployer:", deployer.address);
  console.log("   Aggregator:", aggregator.address);
  console.log("   Contributor 1:", contributor1.address);
  console.log("   Contributor 2:", contributor2.address);
  console.log("   Contributor 3:", contributor3.address);

  // Deploy RewardToken
  console.log("\nDeploying RewardToken...");
  const RewardToken = await ethers.getContractFactory("RewardToken", deployer);
  const rewardToken = await RewardToken.deploy("DemoReward", "RWD", deployer.address, 0);
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = rewardToken.target;
  console.log("   ✓ RewardToken deployed at:", rewardTokenAddress);

  // Deploy ModelRegistry with RewardToken address
  console.log("\nDeploying ModelRegistry...");
  const ModelRegistry = await ethers.getContractFactory("ModelRegistry", deployer);
  const modelRegistry = await ModelRegistry.deploy(deployer.address, rewardTokenAddress);
  await modelRegistry.waitForDeployment();
  const modelRegistryAddress = modelRegistry.target;
  console.log("   ✓ ModelRegistry deployed at:", modelRegistryAddress);

  // Deploy ModelNFT
  console.log("\nDeploying ModelNFT...");
  const ModelNFT = await ethers.getContractFactory("ModelNFT", deployer);
  const modelNFT = await ModelNFT.deploy(modelRegistryAddress, deployer.address);
  await modelNFT.waitForDeployment();
  const modelNFTAddress = modelNFT.target;
  console.log("   ✓ ModelNFT deployed at:", modelNFTAddress);

  // Grant ModelRegistry the MINTER_ROLE on RewardToken
  console.log("\nGranting MINTER_ROLE to ModelRegistry...");
  const MINTER_ROLE = await rewardToken.MINTER_ROLE();
  await rewardToken.connect(deployer).grantRole(MINTER_ROLE, modelRegistryAddress);
  console.log("   ✓ Granted MINTER_ROLE to ModelRegistry on RewardToken");

  // Grant aggregator roles
  console.log("\nGranting roles to aggregator...");
  const RELAYER_ROLE = await modelRegistry.RELAYER_ROLE();
  await modelRegistry.connect(deployer).grantRole(RELAYER_ROLE, aggregator.address);
  console.log("   ✓ Granted RELAYER_ROLE on ModelRegistry");

  const PUBLISHER_ROLE = await modelNFT.PUBLISHER_ROLE();
  await modelNFT.connect(deployer).grantRole(PUBLISHER_ROLE, aggregator.address);
  console.log("   ✓ Granted PUBLISHER_ROLE on ModelNFT");

  // Publish demo models
  console.log("\nPublishing demo models...");

  const demoModels = [
    {
      cid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("initial-baseline-model")),
      round: 0,
      qualityScore: 75.5,
      dpEpsilon: 1.0,
      contributors: [aggregator.address],
      rewards: [ethers.parseEther("10")]
    },
    {
      cid: "QmT4AeWE9Q58EzeL38Fy9k9DdFTUMKpz7V3xNmrHkiNQvr",
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("round-1-improved-accuracy")),
      round: 1,
      qualityScore: 82.3,
      dpEpsilon: 0.8,
      contributors: [contributor1.address, contributor2.address, aggregator.address],
      rewards: [ethers.parseEther("15"), ethers.parseEther("12"), ethers.parseEther("8")]
    },
    {
      cid: "QmPK1s9BdxN4GWRy1fSkBPHhQNhBLRgR7xVxJxVw8qFhPz",
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("round-2-privacy-enhanced")),
      round: 2,
      qualityScore: 88.7,
      dpEpsilon: 0.5,
      contributors: [contributor1.address, contributor2.address, contributor3.address, aggregator.address],
      rewards: [ethers.parseEther("20"), ethers.parseEther("18"), ethers.parseEther("16"), ethers.parseEther("10")]
    },
    {
      cid: "QmXg9X5T8DHQbB6mBFjXKvVKWzNn9t8YGvQfKuEK3Qgv4L",
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("round-3-production-ready")),
      round: 3,
      qualityScore: 92.1,
      dpEpsilon: 0.3,
      contributors: [
        contributor1.address, 
        contributor2.address, 
        contributor3.address, 
        aggregator.address,
        deployer.address
      ],
      rewards: [
        ethers.parseEther("25"), 
        ethers.parseEther("22"), 
        ethers.parseEther("20"), 
        ethers.parseEther("15"),
        ethers.parseEther("12")
      ]
    }
  ];

  for (let i = 0; i < demoModels.length; i++) {
    const model = demoModels[i];
    console.log(`\n   Publishing Model ${i} (Round ${model.round})...`);
    
    await modelRegistry.connect(aggregator).publishModel(
      model.cid,
      model.metadataHash,
      Math.floor(model.qualityScore * 100), // Convert to basis points (e.g., 75.5% = 7550)
      Math.floor(model.dpEpsilon * 100),    // Convert to basis points
      model.contributors,
      model.rewards,
      model.round
    );
    
    console.log(`      ✓ CID: ${model.cid.slice(0, 10)}...`);
    console.log(`      ✓ Quality: ${model.qualityScore}%, DP ε: ${model.dpEpsilon}`);
    console.log(`      ✓ Contributors: ${model.contributors.length}`);
    console.log(`      ✓ Total Rewards: ${ethers.formatEther(
      model.rewards.reduce((sum, r) => sum + r, 0n)
    )} RWD`);
  }

  console.log("\n   ✓ All demo models published successfully!");

  // Write contract addresses to both .env files
  console.log("\nWriting addresses to .env files...");

  const paths = [
    path.join(__dirname, "..", ".env"),                  // blockchain/.env
    path.join(__dirname, "..", "..", "frontend", ".env") // frontend/.env
  ];

  for (const envPath of paths) {
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    function updateEnvVar(content, key, value) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      const line = `${key}=${value}`;
      return regex.test(content)
        ? content.replace(regex, line)
        : content + (content.endsWith("\n") || content === "" ? "" : "\n") + line + "\n";
    }

    // Use regular names for backend, VITE_ prefix for frontend
    const isFrontend = envPath.includes("frontend");
    const prefix = isFrontend ? "VITE_" : "";

    envContent = updateEnvVar(envContent, `${prefix}REWARD_TOKEN_ADDRESS`, rewardTokenAddress);
    envContent = updateEnvVar(envContent, `${prefix}MODEL_REGISTRY_ADDRESS`, modelRegistryAddress);
    envContent = updateEnvVar(envContent, `${prefix}MODEL_NFT_ADDRESS`, modelNFTAddress);
    envContent = updateEnvVar(envContent, `${prefix}AGGREGATOR_ADDRESS`, aggregator.address);
    
    // Add RPC URL for frontend if not exists
    if (isFrontend) {
      if (!envContent.includes('VITE_RPC_URL')) {
        envContent = updateEnvVar(envContent, 'VITE_RPC_URL', 'http://127.0.0.1:8545');
      }
      if (!envContent.includes('VITE_IPFS_GATEWAY')) {
        envContent = updateEnvVar(envContent, 'VITE_IPFS_GATEWAY', 'http://127.0.0.1:8080');
      }
    }

    fs.writeFileSync(envPath, envContent);
    console.log(`   ✓ Updated: ${envPath}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log("\nContract Addresses:");
  console.log("   RewardToken:        ", rewardTokenAddress);
  console.log("   ModelRegistry:      ", modelRegistryAddress);
  console.log("   ModelNFT:           ", modelNFTAddress);
  console.log("   Aggregator Address: ", aggregator.address);
  console.log("\nDemo Data:");
  console.log("   Total Models:       ", demoModels.length);
  console.log("   Rounds:             ", "0 → 3");
  console.log("   Quality Progression:", "75.5% → 92.1%");
  console.log("   Privacy Enhancement:", "ε 1.0 → 0.3");
  console.log("\n✓ All contracts deployed, roles assigned, and demo models published.");
  console.log("✓ Rewards distributed to contributors");
  console.log("=".repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDeployment failed:");
    console.error(error);
    process.exit(1);
  });
