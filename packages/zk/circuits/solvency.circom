pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * 8-Leaf Poseidon Merkle Tree (Depth = 3).
 * Reconstructs the Merkle root from 8 leaf commitments in arithmetic constraints.
 */
template MerkleTree8() {
    signal input leaves[8];
    signal output root;

    // Layer 1: 4 internal nodes
    component h1[4];
    for (var i = 0; i < 4; i++) {
        h1[i] = Poseidon(2);
        h1[i].inputs[0] <== leaves[2 * i];
        h1[i].inputs[1] <== leaves[2 * i + 1];
    }

    // Layer 2: 2 internal nodes
    component h2[2];
    for (var i = 0; i < 2; i++) {
        h2[i] = Poseidon(2);
        h2[i].inputs[0] <== h1[2 * i].out;
        h2[i].inputs[1] <== h1[2 * i + 1].out;
    }

    // Layer 3: Root
    component hRoot = Poseidon(2);
    hRoot.inputs[0] <== h2[0].out;
    hRoot.inputs[1] <== h2[1].out;

    root <== hRoot.out;
}

/**
 * ReserveProof Solvency Circuit (Capacity N = 8)
 *
 * Mathematical Statement Proved:
 * 1. Each customer leaf commitment is computed as Poseidon(customerId, balance, salt, datasetVersion).
 * 2. Each balance is non-negative and bounded within [0, 2^64 - 1] (preventing field wrap-around).
 * 3. The dataset Merkle root computed over all customer commitments equals public merkleRoot.
 * 4. Total customer liabilities equals the EXACT sum of all customer balances: sum(balance[i]) === totalLiabilities.
 * 5. Declared eligible reserves are bounded within [0, 2^64 - 1].
 * 6. The exchange's declared eligible reserves cover total liabilities: declaredReserves >= totalLiabilities.
 * 7. Dataset version binds the proof to a specific snapshot epoch to prevent replay across datasets.
 */
template Solvency(N) {
    // ==========================================
    // PUBLIC SIGNALS
    // ==========================================
    signal input merkleRoot;
    signal input totalLiabilities;
    signal input declaredReserves;
    signal input datasetVersion;

    // ==========================================
    // PRIVATE SIGNALS (WITNESS)
    // ==========================================
    signal input customerId[N];
    signal input balance[N];
    signal input salt[N];

    // ==========================================
    // CONSTRAINTS & COMPUTATIONS
    // ==========================================

    component leafCommitments[N];
    component balanceRangeChecks[N];
    signal computedLeaves[N];
    signal runningSum[N + 1];

    runningSum[0] <== 0;

    for (var i = 0; i < N; i++) {
        // 1. Range check: Ensure 0 <= balance[i] < 2^64
        balanceRangeChecks[i] = Num2Bits(64);
        balanceRangeChecks[i].in <== balance[i];

        // 2. Compute leaf commitment: Poseidon([customerId, balance, salt, datasetVersion])
        leafCommitments[i] = Poseidon(4);
        leafCommitments[i].inputs[0] <== customerId[i];
        leafCommitments[i].inputs[1] <== balance[i];
        leafCommitments[i].inputs[2] <== salt[i];
        leafCommitments[i].inputs[3] <== datasetVersion;

        computedLeaves[i] <== leafCommitments[i].out;

        // 3. Accumulate liabilities
        runningSum[i + 1] <== runningSum[i] + balance[i];
    }

    // 4. Constrain totalLiabilities to exactly match sum of balances
    totalLiabilities === runningSum[N];

    // Range check totalLiabilities to 64 bits
    component totalLiabRange = Num2Bits(64);
    totalLiabRange.in <== totalLiabilities;

    // Range check declaredReserves to 64 bits
    component declaredReservesRange = Num2Bits(64);
    declaredReservesRange.in <== declaredReserves;

    // 5. Constrain declaredReserves >= totalLiabilities
    component solvencyCheck = GreaterEqThan(64);
    solvencyCheck.in[0] <== declaredReserves;
    solvencyCheck.in[1] <== totalLiabilities;
    solvencyCheck.out === 1;

    // 6. Compute Merkle root of all computed leaf commitments and constrain to public merkleRoot
    component tree = MerkleTree8();
    for (var i = 0; i < N; i++) {
        tree.leaves[i] <== computedLeaves[i];
    }
    merkleRoot === tree.root;
}

// Fixed 8-leaf capacity solvency circuit
component main {public [merkleRoot, totalLiabilities, declaredReserves, datasetVersion]} = Solvency(8);
