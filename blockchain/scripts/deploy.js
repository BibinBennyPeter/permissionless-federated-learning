const { ethers } = require("hardhat");
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const ModelRegistry = await ethers.getContractFactory("ModelRegistry");
  const registry = await ModelRegistry.deploy("ModelRegistry", "MDL", deployer);
  await registry.waitForDeployment();
  console.log("ModelRegistry deployed to:", registry.target); 
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
