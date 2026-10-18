# ReserveProof Cryptographic Design & Specifications

## 1. Cryptographic Primitive Selection

| Primitive | Implementation | Rationale |
| :--- | :--- | :--- |
| **Proof System** | Groth16 | Smallest proof size (3 group elements, ~128 bytes), fastest on-chain EVM verification (~200k gas using `ecPairing` precompile at `0x08`). |
| **Elliptic Curve** | BN254 (`alt_bn128`) | Native Ethereum EVM support for addition (`0x06`), scalar multiplication (`0x07`), and pairing check (`0x08`). |
| **Hash Function** | Poseidon (algebraic hash) | Optimized for SNARK arithmetic constraints over $\mathbb{F}_p$; orders of magnitude fewer R1CS constraints than SHA-256 or Keccak-256 (~300 constraints vs ~25,000 constraints). |
| **Merkle Tree Depth** | $D = 4$ ($2^4 = 16$ leaves) | Fixed-size MVP capacity; completely provable inside the circuit in under 10,000 constraints with sub-second proving time. |

---

## 2. Customer Balance Commitment & Leaf Encoding

Each customer account is committed into a single BN254 scalar field element ($\mathbb{F}_p$ where $p = 21888242871839275222246405745257275088548364400416034343698204186575808495617$).

$$\text{Leaf}_i = \text{Poseidon}_4(\text{customerIdNum}_i, \text{balanceSatoshis}_i, \text{salt}_i, \text{datasetVersion})$$

### Parameter Definitions:
1. **`customerIdNum`** $\in \mathbb{F}_p$: A deterministic, non-zero numeric derivation of the customer's opaque identifier (e.g. `cust_001`).
2. **`balanceSatoshis`** $\in [0, 2^{64} - 1]$: The customer's balance denominated in integer satoshis ($1 \text{ BTC} = 10^8 \text{ satoshis}$).
3. **`salt`** $\in \mathbb{F}_p$: A cryptographically random 128-bit secret generated per account per snapshot. This guarantees **perfect hiding** under the random oracle model—even if an attacker guesses a customer's balance, they cannot invert or verify the commitment without the secret salt.
4. **`datasetVersion`** $\in \mathbb{F}_p$: Domain-separation nonce binding the leaf to a specific audit snapshot epoch, preventing cross-snapshot replay attacks.

---

## 3. Merkle Tree Architecture

The tree is a binary Merkle tree of depth $D = 4$ ($N = 16$ leaves):

```
                       Root (Level 4)
                         /        \
                   Node_0          Node_1
                  /      \        /      \
               H2_0      H2_1   H2_2     H2_3
              /    \    /    \  /   \    /   \
            H1_0 ... H1_3     H1_4 ... H1_7
            / \       / \     / \       / \
         L0   L1 ... L6  L7  L8  L9 ... L14 L15
```

- **Layer 0**: 16 Leaf Commitments $L_0, \dots, L_{15}$ computed via $\text{Poseidon}_4$.
- **Layer 1**: 8 Parent Hashes: $H1_k = \text{Poseidon}_2(L_{2k}, L_{2k+1})$.
- **Layer 2**: 4 Internal Hashes: $H2_k = \text{Poseidon}_2(H1_{2k}, H1_{2k+1})$.
- **Layer 3**: 2 Node Hashes: $\text{Node}_k = \text{Poseidon}_2(H2_{2k}, H2_{2k+1})$.
- **Layer 4**: Merkle Root: $\text{Root} = \text{Poseidon}_2(\text{Node}_0, \text{Node}_1)$.

---

## 4. Circom Arithmetic Constraints Formulation

The `Solvency(16)` circuit enforces the following constraint system:

### 1. Balance Range Checks
For each customer $i \in [0, 15]$:
$$\text{Num2Bits}_{64}(\text{balance}_i) \implies 0 \le \text{balance}_i < 2^{64}$$
This mathematically prohibits negative balances, which would otherwise wrap modulo $p$ and enable fraudulent balance cancellation.

### 2. Leaf Integrity & Merkle Consistency
$$\text{Leaf}_i = \text{Poseidon}_4(\text{customerId}_i, \text{balance}_i, \text{salt}_i, \text{datasetVersion})$$
$$\text{tree} = \text{MerkleTree16}(\text{Leaf}_0, \dots, \text{Leaf}_{15})$$
$$\text{merkleRoot} === \text{tree.root}$$

### 3. Exact Liability Summation
$$\text{runningSum}_0 = 0$$
$$\text{runningSum}_{i+1} = \text{runningSum}_i + \text{balance}_i$$
$$\text{totalLiabilities} === \text{runningSum}_{16}$$
$$\text{Num2Bits}_{64}(\text{totalLiabilities})$$

### 4. Solvency Coverage Inequality
$$\text{Num2Bits}_{64}(\text{declaredReserves})$$
$$\text{isSolvent} = \text{GreaterEqThan}_{64}(\text{declaredReserves}, \text{totalLiabilities})$$
$$\text{isSolvent} === 1$$

---

## 5. Signal Visibility Classification

| Signal Name | Visibility | Purpose |
| :--- | :--- | :--- |
| `merkleRoot` | **Public** | Verified on-chain; enables customer inclusion verification. |
| `totalLiabilities` | **Public** | Reported aggregate liabilities for solvency ratio computation. |
| `declaredReserves` | **Public** | Declared reserve assets backing customer liabilities. |
| `datasetVersion` | **Public** | Snapshot epoch identifier preventing proof replay. |
| `customerId[16]` | **Private (Witness)** | Kept confidential on exchange server. |
| `balance[16]` | **Private (Witness)** | Kept confidential on exchange server. |
| `salt[16]` | **Private (Witness)** | Kept confidential on exchange server. |

---

## 6. On-Chain Groth16 Verifier Cost & Equation

The Groth16 pairing verification checks:
$$e(A, B) = e(\alpha, \beta) \cdot e\left(\sum_{j=0}^{l} x_j \gamma_j, \delta\right) \cdot e(C, \delta)$$

where $x_0 = 1$ and $x_1, \dots, x_4$ are the 4 public inputs.

In the generated Solidity contract:
- **Calldata Size**: $\approx 320$ bytes.
- **Execution Cost**: $\approx 210,000$ gas.
- **State Writes**: 1 storage write to save `SolvencyReport` ($\approx 45,000$ gas).
