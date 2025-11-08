const { ethers } = require("hardhat");

async function main() {
  const registryAddr = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  const registry = await ethers.getContractAt("ModelRegistry", registryAddr);

  const tx = await registry.recordSubmission(
    ethers.encodeBytes32String("sample-hash"), // or use keccak/sha externally and pass bytes32
    1, // round
    "0x0000000000000000000000000000000000000001", // sample submitter
    250, // quality (e.g. 0.250 -> 250 scaled)
    100 // numExamples
  );
  await tx.wait();
  console.log("recordSubmission tx mined:", tx.hash);
}

main().catch(console.error);
