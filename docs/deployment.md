# ReserveProof Deployment & Operations Guide

## 1. Prerequisites

- **Node.js**: `v20.x` or `v24.x` (LTS recommended)
- **npm**: `v10.x` or `v11.x`
- **Circom Compiler**: `v2.1.8+` (The repository provides `bin/circom.exe` for Windows; on Linux/macOS install via `cargo install --git https://github.com/iden3/circom.git`)
- **Git**

---

## 2. Local Development Deployment

### Step 1: Install Dependencies
```bash
# In the repository root
npm install
```

### Step 2: Compile the Zero-Knowledge Circuit
Compiles `solvency.circom` to R1CS constraints, C++ / WASM witness generator, and debug symbols.
```bash
npm run zk:compile
```
*Expected Output:*
- `packages/zk/build/solvency.r1cs`
- `packages/zk/build/solvency_js/solvency.wasm`
- `packages/zk/build/solvency.sym`

### Step 3: Execute Development Trusted Setup
Performs a local Powers of Tau ceremony (power 14, BN254 curve) and Phase 2 Groth16 circuit setup, producing the proving key (`.zkey`), verification key (`verification_key.json`), and generated Solidity verifier (`Verifier.sol`).
```bash
npm run zk:setup:dev
```
*Generated Artifacts:*
- `packages/zk/artifacts/solvency_final.zkey`
- `packages/zk/artifacts/verification_key.json`
- `packages/contracts/contracts/Verifier.sol`
- `apps/web/public/zk/solvency.wasm`
- `apps/web/public/zk/solvency_final.zkey`
- `apps/web/public/zk/verification_key.json`

### Step 4: Run Circuit Tests & Contract Tests
```bash
npm test
```

### Step 5: Start Local Hardhat Blockchain (Terminal 1)
```bash
npm run chain:local
```
Starts a simulated Ethereum node on `http://127.0.0.1:8545` with chain ID `31337` and 20 funded test accounts.

### Step 6: Deploy Smart Contracts Locally (Terminal 2)
```bash
npm run deploy:local
```
Deploys `Groth16Verifier.sol` and `ReserveProofRegistry.sol`. Automatically writes deployment addresses to `apps/web/public/contracts.json`.

### Step 7: Launch Next.js Fintech Dashboard
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Optional Ethereum Sepolia Deployment

### Step 1: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate `.env` with your Sepolia RPC and deployment private key:
```env
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
SEPOLIA_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
```
> [!CAUTION]
> Never use a private key containing mainnet funds. Use a dedicated throwaway testnet wallet.

### Step 2: Deploy to Sepolia
```bash
npm run deploy:sepolia
```
*Example Terminal Output:*
```text
Deploying contracts with account: 0x47B0eC7186f2bB8469C31C78D94389eE52F17f3E
Network Chain ID: 11155111
Account Balance: 0.25 ETH

1️⃣ Deploying Groth16 Verifier...
   ✔ Verifier deployed to: 0x1234...abcd

2️⃣ Deploying ReserveProofRegistry...
   ✔ ReserveProofRegistry deployed to: 0x5678...ef01

💾 Saved deployment metadata to: apps/web/public/contracts.json
```

---

## 4. Troubleshooting Guide

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| `circom: command not found` | Circom binary not in system PATH | The script automatically uses `bin/circom.exe` if present. On Linux/macOS, install Circom via Rust `cargo install --git https://github.com/iden3/circom.git` or place the pre-built binary in your PATH. |
| `InsufficientReserves` on contract submit | Declared reserves are less than total liabilities | The contract and circuit enforce $R \ge L$. Generate a valid dataset with coverage $\ge 100\%$. |
| `DuplicateDatasetVersion` revert | Attempting to submit a proof with an already-used dataset version | Change or increment the `datasetVersion` in the private data generator. |
| `InvalidProof` revert | Tampered public signals or mismatched verifier | Ensure `packages/contracts/contracts/Verifier.sol` was generated from the same `.zkey` that produced the proof. Run `npm run zk:setup:dev`. |
| Port 3000 in use | Another application is bound to port 3000 | Run `npm --workspace=@reserveproof/web run dev -- -p 3001`. |
