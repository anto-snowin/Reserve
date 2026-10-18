/**
 * Core type definitions for ReserveProof
 */

export interface CustomerRecord {
  /** Opaque synthetic identifier, e.g. "cust_001" */
  id: string;
  /** Field-compatible numeric identifier (derived from id) */
  idNum: bigint;
  /** Balance in integer satoshis (1 BTC = 100,000,000 satoshis) */
  balanceSatoshis: bigint;
  /** Private randomness salt for commitment hiding */
  salt: bigint;
}

export interface CustomerDataset {
  /** Dataset version / epoch (domain separation nonce) */
  version: bigint;
  /** UNIX timestamp of dataset snapshot */
  timestamp: number;
  /** Private customer records */
  records: CustomerRecord[];
  /** Total aggregate customer liabilities in integer satoshis */
  totalLiabilitiesSatoshis: bigint;
  /** Declared eligible reserve assets in integer satoshis */
  declaredReservesSatoshis: bigint;
}

export interface MerkleInclusionProof {
  /** Poseidon commitment leaf value */
  leaf: bigint;
  /** Leaf index in the tree (0 to 15) */
  leafIndex: number;
  /** Sibling hashes along path from leaf to root */
  pathElements: bigint[];
  /** Position at each level: 0 = leaf is left, 1 = leaf is right */
  pathIndices: number[];
  /** Computed Merkle root */
  root: bigint;
}

export interface Groth16ProofPoints {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

export interface SolidityProofCalldata {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  input: string[];
}

export interface PublicProofBundleMetadata {
  generatedAt: string;
  customerCount: number;
  coverageRatioBps: number;
  isSolvent: boolean;
  excessReservesSatoshis: string;
}

export interface PublicProofBundle {
  /** Schema version */
  version: string;
  /** Circuit identifier */
  circuitId: string;
  /** Dataset Merkle root (hex string e.g. "0x...") */
  merkleRoot: string;
  /** Aggregate customer liabilities in satoshis (string decimal) */
  totalLiabilitiesSatoshis: string;
  /** Declared reserves in satoshis (string decimal) */
  declaredReservesSatoshis: string;
  /** Dataset version / epoch (string decimal) */
  datasetVersion: string;
  /** Ordered public signals array for verifier: [merkleRoot, totalLiabilities, declaredReserves, datasetVersion] */
  publicSignals: string[];
  /** Groth16 proof coordinates */
  proof: Groth16ProofPoints;
  /** Formatted calldata for Solidity verifier contract */
  calldata?: SolidityProofCalldata;
  /** Public non-sensitive metadata */
  metadata: PublicProofBundleMetadata;
}

export interface VerifiedReport {
  id: string;
  merkleRoot: string;
  totalLiabilitiesSatoshis: bigint;
  declaredReservesSatoshis: bigint;
  datasetVersion: bigint;
  coverageRatioBps: number;
  excessReservesSatoshis: bigint;
  isSolvent: boolean;
  timestamp: number;
  submitter?: string;
  transactionHash?: string;
  verificationType: 'local' | 'on-chain';
  verifiedAt: string;
}

export interface CircuitInputWitness {
  merkleRoot: string;
  totalLiabilities: string;
  declaredReserves: string;
  datasetVersion: string;
  customerId: string[];
  balance: string[];
  salt: string[];
}
