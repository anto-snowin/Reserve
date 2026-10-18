import { network } from "hardhat";

async function main() {
  // Connect to the selected network
  const { ethers, networkName } = await network.connect();

  console.log(`Deploying snowin to ${networkName}...`);

  // Get contract factory
  const Snowin = await ethers.getContractFactory("snowin");

  // Deploy contract
  const contract = await Snowin.deploy();

  // Wait until deployment is complete
  await contract.waitForDeployment();

  // Get deployed contract address
  const contractAddress = await contract.getAddress();

  console.log("----------------------------------------");
  console.log("Deployment successful!");
  console.log("Network:", networkName);
  console.log("Contract Address:", contractAddress);
  console.log("----------------------------------------");

  // Read the public variable
  const storedName = await contract.getFunction("name").staticCall();

  console.log("Stored Name:", storedName);
  console.log("----------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});