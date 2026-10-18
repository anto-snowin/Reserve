import { expect } from 'chai';
import { network } from 'hardhat';
import fs from 'fs';
import path from 'path';

const { ethers } = await network.create();

describe('End-to-End Cryptographic & Smart Contract Integration', function () {
  it('should accept and verify the real snarkjs-generated Groth16 proof on-chain', async function () {
    const bundlePath = path.resolve(__dirname, '../../zk/artifacts/public_proof_bundle.json');
    if (!fs.existsSync(bundlePath)) {
      this.skip();
    }
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));

    // Deploy generated Groth16Verifier
    const verifier = await ethers.deployContract('Groth16Verifier');
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();

    // Deploy ReserveProofRegistry with real verifier
    const registry = await ethers.deployContract('ReserveProofRegistry', [verifierAddress]);
    await registry.waitForDeployment();

    const calldata = bundle.calldata;
    expect(calldata).to.not.be.undefined;

    const a: [bigint, bigint] = [BigInt(calldata.a[0]), BigInt(calldata.a[1])];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(calldata.b[0][0]), BigInt(calldata.b[0][1])],
      [BigInt(calldata.b[1][0]), BigInt(calldata.b[1][1])],
    ];
    const c: [bigint, bigint] = [BigInt(calldata.c[0]), BigInt(calldata.c[1])];
    const publicInputs: [bigint, bigint, bigint, bigint] = [
      BigInt(calldata.input[0]),
      BigInt(calldata.input[1]),
      BigInt(calldata.input[2]),
      BigInt(calldata.input[3]),
    ];

    // Submit real proof to smart contract
    const tx = await registry.submitSolvencyProof(a, b, c, publicInputs);
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);

    expect(await registry.getReportCount()).to.equal(1n);
    const report = await registry.getLatestReport();
    expect(report.totalLiabilities).to.equal(BigInt(bundle.totalLiabilitiesSatoshis));
    expect(report.declaredReserves).to.equal(BigInt(bundle.declaredReservesSatoshis));
    expect(report.datasetVersion).to.equal(BigInt(bundle.datasetVersion));
  });

  it('should reject when real public signals are tampered with on-chain', async function () {
    const bundlePath = path.resolve(__dirname, '../../zk/artifacts/public_proof_bundle.json');
    if (!fs.existsSync(bundlePath)) {
      this.skip();
    }
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
    const verifier = await ethers.deployContract('Groth16Verifier');
    const registry = await ethers.deployContract('ReserveProofRegistry', [await verifier.getAddress()]);

    const calldata = bundle.calldata;
    const a: [bigint, bigint] = [BigInt(calldata.a[0]), BigInt(calldata.a[1])];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(calldata.b[0][0]), BigInt(calldata.b[0][1])],
      [BigInt(calldata.b[1][0]), BigInt(calldata.b[1][1])],
    ];
    const c: [bigint, bigint] = [BigInt(calldata.c[0]), BigInt(calldata.c[1])];

    // Tamper with public inputs: alter declared reserves
    const tamperedInputs: [bigint, bigint, bigint, bigint] = [
      BigInt(calldata.input[0]),
      BigInt(calldata.input[1]),
      BigInt(calldata.input[2]) + 1n, // Tampered!
      BigInt(calldata.input[3]),
    ];

    await expect(
      registry.submitSolvencyProof(a, b, c, tamperedInputs)
    ).to.be.revertedWithCustomError(registry, 'InvalidProof');
  });
});
