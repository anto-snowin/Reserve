import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zkDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(zkDir, '../..');
const circuitsDir = path.join(zkDir, 'circuits');
const buildDir = path.join(zkDir, 'build');

// Find circom binary: prioritize local bin/circom.exe if on Windows, else system circom
let circomBin = 'circom';
const localCircom = path.join(rootDir, 'bin', 'circom.exe');
if (fs.existsSync(localCircom)) {
  circomBin = `"${localCircom}"`;
}

console.log('====================================================');
console.log('⚡ ReserveProof: Compiling Solvency Circom Circuit');
console.log('====================================================');
console.log(`Using Circom binary: ${circomBin}`);
console.log(`Circuits directory:  ${circuitsDir}`);
console.log(`Build directory:     ${buildDir}`);

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const circuitPath = path.join(circuitsDir, 'solvency.circom');
const nodeModulesRoot = path.join(rootDir, 'node_modules');
const nodeModulesZk = path.join(zkDir, 'node_modules');

// Compile command with library include paths
const cmd = `${circomBin} "${circuitPath}" --r1cs --wasm --sym -o "${buildDir}" -l "${nodeModulesRoot}" -l "${nodeModulesZk}"`;

console.log(`Executing: ${cmd}`);
try {
  const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
  console.log(output);
  console.log('✅ Circuit successfully compiled to R1CS and WASM!');
} catch (err) {
  console.error('❌ Circuit compilation failed:');
  console.error(err.stdout || err.message);
  process.exit(1);
}
