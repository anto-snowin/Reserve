import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import { sanitizePublicProofBundle, formatSatoshisToBtc, formatBasisPoints } from '@reserveproof/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zkDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(zkDir, 'artifacts');
const buildDir = path.join(zkDir, 'build');

export async function verifyPublicProofBundle(bundleInput, vkeyInput = null) {
  const bundle = typeof bundleInput === 'string' ? JSON.parse(fs.readFileSync(bundleInput, 'utf-8')) : bundleInput;

  // Sanitize and validate bundle structure
  const sanitized = sanitizePublicProofBundle(bundle);

  // Load verification key
  let vkey = vkeyInput;
  if (!vkey) {
    const vkeyPath = fs.existsSync(path.join(artifactsDir, 'verification_key.json'))
      ? path.join(artifactsDir, 'verification_key.json')
      : path.join(buildDir, 'verification_key.json');

    if (!fs.existsSync(vkeyPath)) {
      throw new Error(`Verification key not found at ${vkeyPath}. Run setup first.`);
    }
    vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));
  }

  // Cryptographic Groth16 verification with snarkjs
  const isValidProof = await snarkjs.groth16.verify(vkey, sanitized.publicSignals, sanitized.proof);

  // Additional public signal semantic checks
  const publicRoot = sanitized.publicSignals[0];
  const publicLiabilities = BigInt(sanitized.publicSignals[1]);
  const publicReserves = BigInt(sanitized.publicSignals[2]);
  const publicVersion = BigInt(sanitized.publicSignals[3]);

  const matchesMetadata =
    publicLiabilities === BigInt(sanitized.totalLiabilitiesSatoshis) &&
    publicReserves === BigInt(sanitized.declaredReservesSatoshis) &&
    publicVersion === BigInt(sanitized.datasetVersion);

  const isReservesSufficient = publicReserves >= publicLiabilities;

  return {
    isValid: isValidProof && matchesMetadata && isReservesSufficient,
    isValidProof,
    matchesMetadata,
    isReservesSufficient,
    merkleRoot: publicRoot,
    totalLiabilitiesSatoshis: publicLiabilities,
    declaredReservesSatoshis: publicReserves,
    datasetVersion: publicVersion,
  };
}

async function main() {
  const bundlePath = path.join(artifactsDir, 'public_proof_bundle.json');
  if (!fs.existsSync(bundlePath)) {
    console.error(`❌ Public proof bundle not found at:\n   ${bundlePath}\nRun npm run zk:prove first.`);
    process.exit(1);
  }

  console.log('========================================================');
  console.log('🔍 ReserveProof: Local Cryptographic Proof Verification');
  console.log('========================================================\n');

  console.log(`Loading bundle from: ${bundlePath}`);
  const result = await verifyPublicProofBundle(bundlePath);

  console.log(`\nVerified Public Signals:`);
  console.log(`- Dataset Merkle Root: ${result.merkleRoot}`);
  console.log(`- Total Liabilities:   ${formatSatoshisToBtc(result.totalLiabilitiesSatoshis)} (${result.totalLiabilitiesSatoshis} sats)`);
  console.log(`- Declared Reserves:   ${formatSatoshisToBtc(result.declaredReservesSatoshis)} (${result.declaredReservesSatoshis} sats)`);
  console.log(`- Dataset Version:     ${result.datasetVersion}`);
  console.log(`- Groth16 Cryptographic Verification: ${result.isValidProof ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`- Public Metadata Consistency:         ${result.matchesMetadata ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`- Solvency Coverage Constraint:       ${result.isReservesSufficient ? 'PASSED ✅' : 'FAILED ❌'}`);

  if (result.isValid) {
    console.log('\n🎉 ALL CRYPTOGRAPHIC & SOLVENCY CHECKS VERIFIED SUCCESSFULLY!');
  } else {
    console.error('\n❌ VERIFICATION FAILED: Proof or public signals invalid!');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('❌ Verification error:', err);
    process.exit(1);
  });
}
