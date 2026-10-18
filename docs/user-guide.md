# ReserveProof User & Auditor Guide

## 1. Introduction

Welcome to **ReserveProof**, the privacy-preserving proof-of-reserves (PoR) and solvency platform. This guide walks you through every screen of the dashboard and explains how cryptographic proofs are generated, verified, and audited.

---

## 2. Navigating the Dashboard

### 1. Overview Page (`/`)
The primary executive dashboard displaying the exchange's solvency posture:
- **Exchange Identity & Solvency Status**: Displays whether the exchange is currently verified solvent on-chain.
- **Financial Metrics**:
  - **Total Liabilities**: The aggregate customer deposits backed by the Merkle tree ($L$).
  - **Declared Eligible Reserves**: Total verified assets held by the exchange ($R$).
  - **Coverage Ratio**: Calculated as $\frac{R}{L} \times 100\%$. Green badge when $\ge 100\%$, Red warning when $< 100\%$.
  - **Excess Reserves**: The net buffer ($R - L$).
- **Latest On-Chain Verified Report**: Displays the current active dataset Merkle root, transaction hash, submitter address, and block timestamp.
- **Solvency Breakdown Chart**: Visual comparison of reserves versus liabilities using Recharts.

---

### 2. Private Data Management (`/data`)
> [!WARNING]
> **Confidential Zone**: This screen simulates the exchange's internal accounting database. In a real-world deployment, this interface is restricted to internal infrastructure and is never publicly accessible.

Features:
- **Synthetic Data Generator**:
  - Choose customer count: 16 (circuit capacity), 10, 50, or 100 accounts.
  - Set PRNG Seed for deterministic auditing fixtures.
  - Balance range slider (0.1 BTC to 10.0 BTC).
  - **"Include Zero Balances"**: Injects inactive zero-balance accounts to test circuit boundary conditions.
  - **"Intentionally Insufficient Reserves"**: Creates a simulated insolvent exchange (80% coverage) to test negative verification rejection.
- **Private Customer Records Table**:
  - Displays Opaque Customer IDs (`cust_001`, `cust_002`, ...), balances in satoshis and BTC, and private salts.
  - "Mask / Unmask" toggle with explicit warning.
- **Merkle Tree Commitment Builder**:
  - Computes Poseidon leaf commitments: $\text{Poseidon}(id, balance, salt, version)$.
  - Constructs the 16-leaf Merkle tree and generates the public Merkle Root.

---

### 3. Customer Self-Inclusion Verification
Every customer has the right to verify that their balance was included in the reported total:
1. Navigate to the **Customer Inclusion Checker** in the `/data` or `/inclusion` tab.
2. Select your account (e.g. `cust_001_alice`).
3. The client computes:
   - Your leaf commitment using your private salt.
   - The Merkle path elements ($4$ sibling hashes).
4. Click **Verify Inclusion**.
5. The browser verifies that your leaf hashes up to the published on-chain `merkleRoot`.
6. You now have mathematical proof that your balance was included in the total liabilities sum.

---

### 4. Generate Proof (`/prove`)
Executes the zero-knowledge arithmetic circuit:
1. Review the **Proved Statement** and separation between Public Signals and Private Witness inputs.
2. Click **Start Cryptographic Proving**.
3. Watch the real-time progress indicator:
   - Step 1: Validating Private Dataset
   - Step 2: Computing Poseidon Commitments & Merkle Tree
   - Step 3: Computing Circuit Witness (WASM)
   - Step 4: Generating Groth16 zk-SNARK Proof
   - Step 5: Sanitizing and Exporting Public Bundle
4. Download the **Public Proof Bundle (`public_proof_bundle.json`)**.
   *Note: This JSON contains only public signals and proof coordinates. No private balances or salts are included.*

---

### 5. Verify Proof (`/verify`)
Anyone in the world can verify the proof:
- **Local Verification**:
  - Click **Verify Locally**.
  - Runs `snarkjs.groth16.verify` in the browser against `verification_key.json`.
  - Cryptographic verification completes in $\approx 200\text{ ms}$.
- **On-Chain Smart Contract Verification**:
  - Connect your Web3 wallet (MetaMask, Coinbase Wallet, etc.).
  - Ensure connected to **Hardhat Local** (Chain ID 31337) or **Sepolia Testnet** (Chain ID 11155111).
  - Click **Submit Proof On-Chain**.
  - The smart contract checks the proof coordinates against the deployed Groth16 Verifier, verifies $R \ge L$, and permanently records the report in `ReserveProofRegistry`.

---

### 6. Reports History (`/reports`)
- Browse all previously submitted on-chain and local reports.
- Inspect Merkle roots, liabilities, declared reserves, and coverage ratios.
- View Ethereum transaction hashes and verify on Etherscan.
