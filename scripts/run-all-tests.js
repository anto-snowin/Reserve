import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🧪 ReserveProof: Running Full Comprehensive Automated Test Suite');
console.log('================================================================\n');

const testSuites = [
  {
    name: '1. Merkle Tree & Circuit Security Unit Tests (@reserveproof/zk)',
    cmd: 'node packages/zk/test/circuit.test.js',
    cwd: rootDir,
  },
  {
    name: '2. Smart Contract & Verifier Tests (@reserveproof/contracts)',
    cmd: 'npm --workspace=@reserveproof/contracts run test',
    cwd: rootDir,
  },
  {
    name: '3. Frontend Unit & Schema Validation Tests (@reserveproof/web)',
    cmd: 'npm --workspace=@reserveproof/web run test',
    cwd: rootDir,
  },
];

let allPassed = true;
const results = [];

for (const suite of testSuites) {
  console.log(`\n▶ Running: ${suite.name}`);
  console.log(`  $ ${suite.cmd}\n`);
  const start = Date.now();
  try {
    execSync(suite.cmd, { cwd: suite.cwd, stdio: 'inherit' });
    const duration = Date.now() - start;
    results.push({ name: suite.name, status: 'PASSED', duration });
    console.log(`\n✔ ${suite.name} PASSED (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ name: suite.name, status: 'FAILED', duration });
    console.error(`\n❌ ${suite.name} FAILED (${duration}ms)`);
    allPassed = false;
  }
}

console.log('\n================================================================');
console.log('📊 Test Execution Summary');
console.log('================================================================');
for (const res of results) {
  const icon = res.status === 'PASSED' ? '✅' : '❌';
  console.log(`${icon} [${res.status}] ${res.name} (${res.duration}ms)`);
}
console.log('================================================================\n');

if (!allPassed) {
  console.error('❌ One or more test suites failed.');
  process.exit(1);
} else {
  console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');
}
