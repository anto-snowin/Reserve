/**
 * Poseidon-based Merkle Tree and Leaf Commitments.
 * Cryptographically identical to the Circom arithmetic circuit implementation.
 */

import { buildPoseidon } from 'circomlibjs';
import type { MerkleInclusionProof } from './types.js';

let poseidonSingleton: any = null;

/**
 * Returns initialized circomlibjs Poseidon instance
 */
export async function getPoseidon(): Promise<any> {
  if (!poseidonSingleton) {
    poseidonSingleton = await buildPoseidon();
  }
  return poseidonSingleton;
}

/**
 * Hash arbitrary array of BigInts into BN254 field element using Poseidon
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const rawHash = poseidon(inputs);
  return poseidon.F.toObject(rawHash);
}

/**
 * Compute leaf commitment: Poseidon([customerId, balance, salt, datasetVersion])
 * Commits to customer identity, balance, salt randomness, and dataset domain separation nonce.
 */
export async function computeLeafCommitment(
  customerIdNum: bigint,
  balanceSatoshis: bigint,
  salt: bigint,
  datasetVersion: bigint
): Promise<bigint> {
  return poseidonHash([customerIdNum, balanceSatoshis, salt, datasetVersion]);
}

/**
 * Fixed-capacity 16-leaf Merkle Tree (Depth = 4).
 * Matches the Solvency(16) Circom circuit exactly.
 */
export class MerkleTree16 {
  public readonly depth: number = 4;
  public readonly capacity: number = 16;
  public leaves: bigint[];
  public layers: bigint[][];

  private constructor(leaves: bigint[], layers: bigint[][]) {
    this.leaves = leaves;
    this.layers = layers;
  }

  /**
   * Build a 16-leaf Merkle Tree from array of 16 leaf commitments.
   */
  public static async create(leaves: bigint[]): Promise<MerkleTree16> {
    if (leaves.length !== 16) {
      throw new Error(`MerkleTree16 requires exactly 16 leaves, received ${leaves.length}`);
    }

    const poseidon = await getPoseidon();
    const hash2 = (left: bigint, right: bigint): bigint => {
      const h = poseidon([left, right]);
      return poseidon.F.toObject(h);
    };

    const layers: bigint[][] = [];
    layers.push([...leaves]); // Layer 0 (16 leaves)

    let currentLayer = leaves;
    while (currentLayer.length > 1) {
      const nextLayer: bigint[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        nextLayer.push(hash2(currentLayer[i], currentLayer[i + 1]));
      }
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    return new MerkleTree16(leaves, layers);
  }

  /**
   * Return the computed Merkle root
   */
  public getRoot(): bigint {
    return this.layers[this.depth][0];
  }

  /**
   * Generate an inclusion proof for the leaf at leafIndex (0 to 15)
   */
  public getInclusionProof(leafIndex: number): MerkleInclusionProof {
    if (leafIndex < 0 || leafIndex >= this.capacity) {
      throw new Error(`Leaf index ${leafIndex} out of bounds (0-15)`);
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const isRightNode = idx % 2 === 1;
      const siblingIdx = isRightNode ? idx - 1 : idx + 1;
      pathElements.push(this.layers[level][siblingIdx]);
      pathIndices.push(isRightNode ? 1 : 0);
      idx = Math.floor(idx / 2);
    }

    return {
      leaf: this.leaves[leafIndex],
      leafIndex,
      pathElements,
      pathIndices,
      root: this.getRoot(),
    };
  }

  /**
   * Verify an inclusion proof against a specified root
   */
  public static async verifyInclusionProof(
    proof: MerkleInclusionProof,
    expectedRoot?: bigint
  ): Promise<boolean> {
    const poseidon = await getPoseidon();
    let current = proof.leaf;

    for (let i = 0; i < proof.pathElements.length; i++) {
      const sibling = proof.pathElements[i];
      const isRight = proof.pathIndices[i] === 1;

      const left = isRight ? sibling : current;
      const right = isRight ? current : sibling;

      const h = poseidon([left, right]);
      current = poseidon.F.toObject(h);
    }

    const targetRoot = expectedRoot !== undefined ? expectedRoot : proof.root;
    return current === targetRoot;
  }
}
