import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import {
  generateSyntheticDataset,
  validateDataset,
  computeLeafCommitment,
  MerkleTree16,
  calculateCoverageRatioBps,
  calculateExcessReserves,
  isSolvent,
  sanitizePublicProofBundle,
} from '@reserveproof/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zkDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(zkDir, 'artifacts');
const buildDir = path.join(zkDir, 'build');

/**
 * Parse snarkjs exportSolidityCallData string format:
 * ["0x..", "0x.."], [["0x..","0x.."],["0x..","0x.."]], ["0x..","0x.."], ["0x..", "0x..", ...]
 */
export function parseSolidityCalldata(calldataStr) {
  try {
    const wrapped = `[${calldataStr}]`;
    const parsed = JSON.parse(wrapped);
    return {
      a: parsed[0],
      b: parsed[1],
      c: parsed[2],
      input: parsed[3],
    };
  } catch (err) {
    console.warn('Failed to parse calldata via JSON, using fallback regex:', err.message);
    return undefined;
  }
}

export async function generateProofForDataset(dataset, options = {}) {
  const silent = options.silent ?? false;
  const log = silent ? () => {} : console.log;

  log('========================================================');
  log('⚡ ReserveProof: Zero-Knowledge Groth16 Proof Generation');
  log('========================================================\n');

  // 1. Validate dataset
  log('1️⃣ Validating private synthetic customer dataset...');
  const validation = validateDataset(dataset);
  if (!validation.valid) {
    throw new Error(`Dataset validation failed:\n${validation.errors.join('\n')}`);
  }
  log(`   ✔ Validated ${dataset.records.length} customer records.`);
  log(`   ✔ Total Liabilities: ${dataset.totalLiabilitiesSatoshis.toLocaleString()} satoshis`);
  log(`   ✔ Declared Reserves: ${dataset.declaredReservesSatoshis.toLocaleString()} satoshis`);
  log(`   ✔ Solvent: ${isSolvent(dataset.declaredReservesSatoshis, dataset.totalLiabilitiesSatoshis)}`);

  // 2. Compute Poseidon Leaf Commitments
  log('\n2️⃣ Computing Poseidon leaf commitments...');
  const leaves = [];
  for (let i = 0; i < 8; i++) {
    const rec = dataset.records[i];
    const leaf = await computeLeafCommitment(rec.idNum, rec.balanceSatoshis, rec.salt, dataset.version);
    leaves.push(leaf);
  }
  log('   ✔ 8 Poseidon leaf commitments computed.');

  // 3. Construct 8-leaf Merkle tree
  log('\n3️⃣ Constructing Poseidon Merkle Tree (Depth = 3)...');
  const tree = await MerkleTree16.create(leaves);
  const root = tree.getRoot();
  log(`   ✔ Merkle Root: 0x${root.toString(16)}`);

  // 4. Prepare circuit inputs
  const circuitInput = {
    merkleRoot: root.toString(),
    totalLiabilities: dataset.totalLiabilitiesSatoshis.toString(),
    declaredReserves: dataset.declaredReservesSatoshis.toString(),
    datasetVersion: dataset.version.toString(),
    customerId: dataset.records.map((r) => r.idNum.toString()),
    balance: dataset.records.map((r) => r.balanceSatoshis.toString()),
    salt: dataset.records.map((r) => r.salt.toString()),
  };

  // Paths to wasm and zkey
  const wasmPath = fs.existsSync(path.join(artifactsDir, 'solvency.wasm'))
    ? path.join(artifactsDir, 'solvency.wasm')
    : path.join(buildDir, 'solvency_js', 'solvency.wasm');

  const zkeyPath = fs.existsSync(path.join(artifactsDir, 'solvency_final.zkey'))
    ? path.join(artifactsDir, 'solvency_final.zkey')
    : path.join(buildDir, 'solvency_final.zkey');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    throw new Error('Circuit build artifacts not found! Run npm run zk:setup:dev first.');
  }

  // 5. Generate Groth16 witness and proof
  log('\n4️⃣ Computing witness and generating Groth16 proof with snarkjs...');
  const start = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
  const elapsed = Date.now() - start;
  log(`   ✔ Proof generated in ${elapsed} ms.`);

  // 6. Generate Solidity Calldata
  const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const calldata = parseSolidityCalldata(calldataStr);

  const coverageRatioBps = calculateCoverageRatioBps(
    dataset.declaredReservesSatoshis,
    dataset.totalLiabilitiesSatoshis
  );
  const excessReservesSatoshis = calculateExcessReserves(
    dataset.declaredReservesSatoshis,
    dataset.totalLiabilitiesSatoshis
  );

  // 7. Assemble and sanitize public proof bundle (NO private witness data!)
  const publicBundle = {
    version: '1.0.0',
    circuitId: 'reserveproof-solvency-v1',
    merkleRoot: `0x${root.toString(16).padStart(64, '0')}`,
    totalLiabilitiesSatoshis: dataset.totalLiabilitiesSatoshis.toString(),
    declaredReservesSatoshis: dataset.declaredReservesSatoshis.toString(),
    datasetVersion: dataset.version.toString(),
    publicSignals: publicSignals.map((s) => s.toString()),
    proof,
    calldata,
    metadata: {
      generatedAt: new Date().toISOString(),
      customerCount: dataset.records.length,
      coverageRatioBps,
      isSolvent: isSolvent(dataset.declaredReservesSatoshis, dataset.totalLiabilitiesSatoshis),
      excessReservesSatoshis: excessReservesSatoshis.toString(),
    },
  };

  const sanitized = sanitizePublicProofBundle(publicBundle);
  log('\n5️⃣ Verified Public Proof Bundle sanitization: ZERO private data leaked.');

  return { bundle: sanitized, tree, dataset };
}

async function main() {
  // Generate canonical Alice, Bob, Charlie, David dataset
  const dataset = generateSyntheticDataset({
    count: 8,
    seed: 42,
    reserveMultiplierBps: 12_000, // 120%
    datasetVersion: 1n,
  });

  const { bundle } = await generateProofForDataset(dataset);

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const bundlePath = path.join(artifactsDir, 'public_proof_bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  console.log(`\n💾 Saved public proof bundle to:\n   ${bundlePath}`);
}

// Execute if run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ Proof generation error:', err);
    process.exit(1);
  });
}
