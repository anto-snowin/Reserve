# ReserveProof Threat Model & Security Analysis

## 1. Executive Summary

ReserveProof provides cryptographic proof-of-reserves (PoR) and solvency verification for cryptocurrency exchanges. It enables an exchange to mathematically prove to users and regulators that its aggregate customer liabilities do not exceed its declared eligible reserves, while keeping individual customer balances private.

> [!IMPORTANT]
> **Cryptographic Scope Limitation**:
> A zero-knowledge proof verifies only the exact mathematical relations encoded within the circuit. It does **not** prove that the exchange recorded all real-world customer balances, nor does it prove that declared reserves are legally unencumbered, un-borrowed, or physically accessible off-chain.

---

## 2. Trust Boundaries and System Participants

```
+-----------------------------------------------------------------------------------+
| Private Exchange Boundary (UNTRUSTED OPERATOR DOMAIN)                             |
|                                                                                   |
|  [Internal Accounting DB] -> [Private Data Service] -> [Circom Prover (Witness)]  |
|                                                                 |                 |
+-----------------------------------------------------------------|-----------------+
                                                                  | Public Proof
                                                                  v Bundle
+-----------------------------------------------------------------------------------+
| Public Verification Boundary (VERIFIABLE DOMAIN)                                  |
|                                                                                   |
|  [Public Proof Bundle]                                                            |
|         |                                                                         |
|         +---> [Browser / snarkjs Local Verifier]                                  |
|         |                                                                         |
|         +---> [Ethereum / Hardhat ReserveProofRegistry Contract]                  |
|                                                                                   |
|  [Individual Customer] <--- [Inclusion Proof] <--- [Merkle Tree Leaf Commitment]  |
+-----------------------------------------------------------------------------------+
```

---

## 3. Threat Assessment Matrix

| Threat | Description | MVP Mitigation Status | Mechanism / Residual Risk |
| :--- | :--- | :--- | :--- |
| **Omitted Customer Liabilities** | Exchange omits high-balance customer accounts from the dataset to artificially reduce total liabilities. | ⚠️ Partially Addressed | **MVP Mitigation**: Merkle tree inclusion proofs allow users to verify their leaf is in the root. **Residual Risk**: Only customers who actively check are guaranteed inclusion. Collusion or unmonitored accounts remain unrepresented. |
| **Negative Customer Balances** | Exchange injects negative balances to cancel out real customer liabilities. | ✅ Fully Prevented | **Circuit Constraint**: `Num2Bits(64)` strictly enforces $0 \le \text{balance}[i] < 2^{64}$. Negative field elements (which wrap modulo $p$) are unconditionally rejected by R1CS bit-decomposition constraints. |
| **Modified / Altered Balances** | Operator modifies balance before proving. | ✅ Fully Prevented | Merkle root binds the balance. Customer inclusion proof will fail if the balance differs from the customer's true balance. |
| **Arithmetic Field Overflow** | Operator exploits $\mathbb{F}_p$ modular arithmetic to pass a fraudulent liability sum. | ✅ Fully Prevented | The sum $\sum \text{balance}[i]$ and `totalLiabilities` are both bounded by 64 bits. Since $16 \times 2^{64} \ll p \approx 2^{254}$, field wrap-around is mathematically impossible. |
| **Insufficient Reserves Accepted** | Operator proves liabilities greater than declared reserves. | ✅ Fully Prevented | `GreaterEqThan(64)` constraint in Circom requires `declaredReserves >= totalLiabilities`. Solidity contract independently enforces `declaredReserves >= totalLiabilities`. |
| **Tampered Public Signals** | Operator alters Merkle root or liabilities in transit. | ✅ Fully Prevented | Groth16 verification equation $e(A, B) = e(\alpha, \beta) + e(x \cdot \gamma, \delta) + e(C, \delta)$ directly binds public inputs. Altering any public signal causes verification to fail. |
| **Replayed Proof Submissions** | Submitting an old proof for a new snapshot epoch. | ✅ Fully Prevented | The smart contract tracks `datasetVersion` in `mapping(uint256 => SolvencyReport)`. Replays with an existing version revert with `DuplicateDatasetVersion`. |
| **Public Leakage of Private Data** | Individual balances, customer IDs, or salts leaked in public bundle or contract. | ✅ Fully Prevented | All customer details are private witness signals. Public bundles are sanitized through strict schema filters rejecting private keys. Smart contracts never store customer data. |
| **Double-Counted or Borrowed Reserves** | Exchange borrows assets temporarily (e.g. flash loans or loans from affiliate trading desks) to pass the snapshot. | ❌ Unresolved in MVP | Requires cryptographic time-weighted balance proofs, multi-day snapshot windows, and collateral encumbrance registries. |
| **Compromised Development Setup** | Toxic waste in local Groth16 ceremony exposed. | ⚠️ Development Warning | MVP uses a local reproducible ceremony for rapid development. Production requires multi-party trusted setup (MPC) or transparent proof systems (STARKs / Halo2). |

---

## 4. Why Merkle Commitment $\ne$ Completeness

A Merkle root proves that a set of 16 accounts exists and sums to $L$. It **cannot** prove that the set of accounts represents 100% of the exchange's real user accounts. 

### Customer Inclusion Protocol (Mitigation)
To prevent the exchange from omitting accounts:
1. The exchange publishes the Merkle root $R$ and dataset version $V$.
2. The exchange provides each customer $i$ with their private leaf values: `(customerIdNum, balance, salt)` and their sibling path `pathElements[4]`.
3. The customer runs the client-side inclusion checker in their browser:
   $$\text{Leaf} = \text{Poseidon}(id, balance, salt, V)$$
   $$\text{ComputedRoot} = \text{VerifyPath}(\text{Leaf}, pathElements)$$
   $$\text{Assert}(\text{ComputedRoot} == R)$$
4. If the computed root matches $R$, the customer has mathematical proof that their specific balance was counted in the liability sum $L$.
5. If the exchange omitted their account, their inclusion proof will fail, exposing the fraudulent proof.

---

## 5. Production Recommendations

1. **On-Chain Reserve Proofs**:
   Instead of a self-declared reserve amount, link the contract to multi-signature wallet balance oracles or smart contracts holding verifiable custody.
2. **Deterministic Time-Window Snapshots**:
   Randomized or unannounced snapshot block numbers prevent temporary borrowing of assets (flash loans or short-term lending).
3. **Decentralized Multi-Party Ceremony**:
   Phase 2 circuit trusted setup must be executed via public ceremony with hundreds of independent contributors.
