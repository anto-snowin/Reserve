import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zkDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(zkDir, '../..');
const buildDir = path.join(zkDir, 'build');
const artifactsDir = path.join(zkDir, 'artifacts');
const contractsDir = path.resolve(rootDir, 'packages/contracts/contracts');
const webPublicZkDir = path.resolve(rootDir, 'apps/web/public/zk');

console.log('========================================================');
console.log('🔐 ReserveProof: Groth16 Development Trusted Setup');
console.log('========================================================');
console.log('⚠️  DEVELOPMENT NOTICE: This creates a development-only setup.');
console.log('   In production, a multi-party ceremony or universal SNARK is required.\n');

[buildDir, artifactsDir, contractsDir, webPublicZkDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const r1csPath = path.join(buildDir, 'solvency.r1cs');
if (!fs.existsSync(r1csPath)) {
  console.log('R1CS file not found. Running compilation first...');
  execSync(`node "${path.join(__dirname, 'compile.js')}"`, { stdio: 'inherit' });
}

const snarkjsCli = path.join(rootDir, 'node_modules/snarkjs/build/cli.cjs');
const snarkjsCmd = `node "${snarkjsCli}"`;

function run(cmd, desc) {
  const fullCmd = cmd.replace(/^npx snarkjs/, snarkjsCmd);
  console.log(`\n▶ ${desc}`);
  console.log(`$ ${fullCmd}`);
  execSync(fullCmd, { cwd: buildDir, stdio: 'inherit' });
}

// 1. Powers of Tau Phase 1 (2^14 = 16,384 constraints, sufficient for ~9,500 constraints)
const ptauFinal = path.join(buildDir, 'pot14_final.ptau');
if (!fs.existsSync(ptauFinal)) {
  run('npx snarkjs powersoftau new bn128 14 pot14_0000.ptau -v', 'Starting new Powers of Tau ceremony (bn128, power 14)...');
  run('npx snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="Dev Contributor 1" -v -e="dev_entropy_seed_1_solvency"', 'Contributing entropy to Powers of Tau...');
  run('npx snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v', 'Preparing Phase 2...');
} else {
  console.log('✅ Reusing existing pot14_final.ptau');
}

// 2. Groth16 Circuit Setup (Phase 2)
const zkey0 = path.join(buildDir, 'solvency_0000.zkey');
const zkeyFinal = path.join(buildDir, 'solvency_final.zkey');

run(`npx snarkjs groth16 setup solvency.r1cs pot14_final.ptau "${zkey0}"`, 'Generating initial zkey for Solvency circuit...');
run(`npx snarkjs zkey beacon "${zkey0}" "${zkeyFinal}" 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Dev Beacon"`, 'Applying final random beacon to generate solvency_final.zkey...');

// 3. Export Verification Key
const vkeyPath = path.join(buildDir, 'verification_key.json');
run(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkeyPath}"`, 'Exporting verification_key.json...');

// 4. Export Solidity Verifier Contract
const verifierSolPath = path.join(buildDir, 'Verifier.sol');
run(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierSolPath}"`, 'Exporting Solidity Groth16 Verifier.sol...');

// 5. Copy artifacts to packages/contracts and apps/web
console.log('\n📦 Copying generated artifacts...');

// Copy Verifier.sol to contracts
const targetVerifierSol = path.join(contractsDir, 'Verifier.sol');
fs.copyFileSync(verifierSolPath, targetVerifierSol);
console.log(`✔ Copied Verifier.sol -> ${targetVerifierSol}`);

// Copy verification_key.json, zkey, and wasm to artifacts and web/public
const wasmSrc = path.join(buildDir, 'solvency_js', 'solvency.wasm');
const wasmDestArtifacts = path.join(artifactsDir, 'solvency.wasm');
const wasmDestWeb = path.join(webPublicZkDir, 'solvency.wasm');

fs.copyFileSync(vkeyPath, path.join(artifactsDir, 'verification_key.json'));
fs.copyFileSync(vkeyPath, path.join(webPublicZkDir, 'verification_key.json'));
fs.copyFileSync(zkeyFinal, path.join(artifactsDir, 'solvency_final.zkey'));
fs.copyFileSync(zkeyFinal, path.join(webPublicZkDir, 'solvency_final.zkey'));

if (fs.existsSync(wasmSrc)) {
  fs.copyFileSync(wasmSrc, wasmDestArtifacts);
  fs.copyFileSync(wasmSrc, wasmDestWeb);
  console.log(`✔ Copied solvency.wasm -> ${wasmDestArtifacts} and web/public/zk/`);
}

console.log('\n========================================================');
console.log('🎉 Development Trusted Setup Completed Successfully!');
console.log('========================================================');
