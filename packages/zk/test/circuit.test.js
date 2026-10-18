import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateSyntheticDataset,
  validateDataset,
  computeLeafCommitment,
  MerkleTree8,
  calculateCoverageRatioBps,
  calculateExcessReserves,
  isSolvent,
  sanitizePublicProofBundle,
} from '@reserveproof/shared';
import { generateProofForDataset } from '../scripts/prove.js';
import { verifyPublicProofBundle } from '../scripts/verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const zkDir = path.resolve(__dirname, '..');
const artifactsDir = path.join(zkDir, 'artifacts');

describe('Merkle Tree and Leaf Commitments', () => {
  it('should compute deterministic leaf commitments for identical inputs', async () => {
    const leaf1 = await computeLeafCommitment(12345n, 100_000_000n, 99999n, 1n);
    const leaf2 = await computeLeafCommitment(12345n, 100_000_000n, 99999n, 1n);
    assert.equal(leaf1, leaf2);
  });

  it('should change leaf commitment when datasetVersion changes (domain separation)', async () => {
    const leaf1 = await computeLeafCommitment(12345n, 100_000_000n, 99999n, 1n);
    const leaf2 = await computeLeafCommitment(12345n, 100_000_000n, 99999n, 2n);
    assert.notEqual(leaf1, leaf2);
  });

  it('should build an 8-leaf Merkle tree and verify valid inclusion proofs for all leaves', async () => {
    const leaves = [];
    for (let i = 0; i < 8; i++) {
      leaves.push(await computeLeafCommitment(BigInt(i + 1), BigInt((i + 1) * 10_000_000), 55555n, 1n));
    }

    const tree = await MerkleTree8.create(leaves);
    const root = tree.getRoot();
    assert.ok(root > 0n);

    // Verify inclusion proof for each leaf index 0..7
    for (let i = 0; i < 8; i++) {
      const proof = tree.getInclusionProof(i);
      assert.equal(proof.leaf, leaves[i]);
      assert.equal(proof.root, root);
      assert.equal(proof.pathElements.length, 3); // Depth = 3

      const isValid = await MerkleTree8.verifyInclusionProof(proof);
      assert.equal(isValid, true, `Inclusion proof for leaf ${i} should be valid`);
    }
  });

  it('should reject inclusion proof when leaf value is modified', async () => {
    const leaves = [];
    for (let i = 0; i < 8; i++) {
      leaves.push(await computeLeafCommitment(BigInt(i + 1), 100_000_000n, 55555n, 1n));
    }
    const tree = await MerkleTree8.create(leaves);
    const proof = tree.getInclusionProof(3);

    // Tamper with the leaf value
    const tamperedProof = {
      ...proof,
      leaf: proof.leaf + 1n,
    };

    const isValid = await MerkleTree8.verifyInclusionProof(tamperedProof);
    assert.equal(isValid, false, 'Tampered leaf must fail verification');
  });

  it('should reject inclusion proof when sibling hash is modified', async () => {
    const leaves = [];
    for (let i = 0; i < 8; i++) {
      leaves.push(await computeLeafCommitment(BigInt(i + 1), 100_000_000n, 55555n, 1n));
    }
    const tree = await MerkleTree8.create(leaves);
    const proof = tree.getInclusionProof(5);

    // Tamper with pathElements[0]
    const tamperedPath = [...proof.pathElements];
    tamperedPath[0] = tamperedPath[0] + 1n;

    const tamperedProof = {
      ...proof,
      pathElements: tamperedPath,
    };

    const isValid = await MerkleTree8.verifyInclusionProof(tamperedProof);
    assert.equal(isValid, false, 'Tampered sibling must fail verification');
  });

  it('should reject inclusion proof when verified against wrong root', async () => {
    const leaves = [];
    for (let i = 0; i < 8; i++) {
      leaves.push(await computeLeafCommitment(BigInt(i + 1), 100_000_000n, 55555n, 1n));
    }
    const tree = await MerkleTree8.create(leaves);
    const proof = tree.getInclusionProof(0);

    const wrongRoot = tree.getRoot() + 1n;
    const isValid = await MerkleTree8.verifyInclusionProof(proof, wrongRoot);
    assert.equal(isValid, false, 'Verification against wrong root must fail');
  });
});

describe('Zero-Knowledge Proof & Public Signals Security', () => {
  let validBundle = null;

  before(async () => {
    // Generate valid test dataset with 120% reserve coverage
    const dataset = generateSyntheticDataset({
      count: 8,
      seed: 999,
      reserveMultiplierBps: 12_000,
      datasetVersion: 1n,
      includeZeroBalances: true, // test edge case with 0 balance
    });

    const result = await generateProofForDataset(dataset, { silent: true });
    validBundle = result.bundle;
  });

  it('should successfully verify a valid generated proof locally', async () => {
    assert.ok(validBundle, 'Proof bundle should exist');
    const result = await verifyPublicProofBundle(validBundle);
    assert.equal(result.isValid, true);
    assert.equal(result.isValidProof, true);
    assert.equal(result.matchesMetadata, true);
    assert.equal(result.isReservesSufficient, true);
  });

  it('should reject proof verification when public Merkle root is tampered', async () => {
    const tampered = JSON.parse(JSON.stringify(validBundle));
    // Tamper root signal (index 0)
    tampered.publicSignals[0] = '1234567890';
    tampered.merkleRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const result = await verifyPublicProofBundle(tampered);
    assert.equal(result.isValid, false, 'Proof with tampered root must be rejected');
  });

  it('should reject proof verification when public totalLiabilities is tampered', async () => {
    const tampered = JSON.parse(JSON.stringify(validBundle));
    // Tamper liabilities (index 1) - e.g. claiming less liabilities than actual
    tampered.publicSignals[1] = '1000';
    tampered.totalLiabilitiesSatoshis = '1000';

    const result = await verifyPublicProofBundle(tampered);
    assert.equal(result.isValid, false, 'Proof with altered liabilities must be rejected');
  });

  it('should reject proof verification when declaredReserves is tampered', async () => {
    const tampered = JSON.parse(JSON.stringify(validBundle));
    // Tamper declared reserves (index 2)
    tampered.publicSignals[2] = '9999999999999';
    tampered.declaredReservesSatoshis = '9999999999999';

    const result = await verifyPublicProofBundle(tampered);
    assert.equal(result.isValid, false, 'Proof with altered reserves must be rejected');
  });

  it('should reject proof verification when datasetVersion is tampered', async () => {
    const tampered = JSON.parse(JSON.stringify(validBundle));
    // Tamper datasetVersion (index 3)
    tampered.publicSignals[3] = '99';
    tampered.datasetVersion = '99';

    const result = await verifyPublicProofBundle(tampered);
    assert.equal(result.isValid, false, 'Proof with altered datasetVersion must be rejected');
  });

  it('should strictly sanitize public bundle and reject if private witness data is present', () => {
    const badBundle = {
      ...validBundle,
      salt: '12345678', // forbidden private key
    };

    assert.throws(
      () => sanitizePublicProofBundle(badBundle),
      /SECURITY VIOLATION/,
      'Sanitizer must throw on private witness keys'
    );
  });
});
