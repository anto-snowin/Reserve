import { network } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webPublicDir = path.join(rootDir, 'apps/web/public');

async function main() {
  console.log('====================================================');
  console.log('🚀 ReserveProof: Smart Contract Deployment');
  console.log('====================================================\n');

  const { ethers } = await network.create();
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Network Chain ID: ${chainId}`);
  console.log(`Account Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy Groth16 Verifier
  console.log('1️⃣ Deploying Groth16 Verifier...');
  const verifier = await ethers.deployContract('Groth16Verifier');
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`   ✔ Verifier deployed to: ${verifierAddress}`);

  // 2. Deploy ReserveProofRegistry
  console.log('\n2️⃣ Deploying ReserveProofRegistry...');
  const registry = await ethers.deployContract('ReserveProofRegistry', [verifierAddress]);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`   ✔ ReserveProofRegistry deployed to: ${registryAddress}`);

  // 3. Persist deployment info for frontend and CLI
  const deploymentInfo = {
    chainId: Number(chainId),
    verifierAddress,
    registryAddress,
    deployerAddress: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(webPublicDir)) {
    fs.mkdirSync(webPublicDir, { recursive: true });
  }

  const webContractsFile = path.join(webPublicDir, 'contracts.json');
  fs.writeFileSync(webContractsFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Saved deployment metadata to: ${webContractsFile}`);

  const localDeployFile = path.join(__dirname, '../deployments.json');
  fs.writeFileSync(localDeployFile, JSON.stringify(deploymentInfo, null, 2));

  console.log('\n====================================================');
  console.log('🎉 Deployment Completed Successfully!');
  console.log('====================================================');
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exitCode = 1;
});
