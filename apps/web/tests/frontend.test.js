import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSyntheticDataset,
  validateDataset,
  calculateCoverageRatioBps,
  calculateExcessReserves,
  formatSatoshisToBtc,
  formatBasisPoints,
  isSolvent,
  sanitizePublicProofBundle,
} from '@reserveproof/shared';

describe('Frontend Data & Formatting Verification', () => {
  it('should accurately format satoshis to BTC without floating point issues', () => {
    assert.equal(formatSatoshisToBtc(100_000_000n), '1.00000000 BTC');
    assert.equal(formatSatoshisToBtc(1_000_000_000n), '10.00000000 BTC');
    assert.equal(formatSatoshisToBtc(123456789n), '1.23456789 BTC');
    assert.equal(formatSatoshisToBtc(0n), '0.00000000 BTC');
    assert.equal(formatSatoshisToBtc(-50_000_000n), '-0.50000000 BTC');
  });

  it('should compute exact coverage ratio and excess reserves', () => {
    const liabilities = 1_000_000_000n; // 10 BTC
    const reserves = 1_200_000_000n; // 12 BTC

    const coverageBps = calculateCoverageRatioBps(reserves, liabilities);
    assert.equal(coverageBps, 12_000); // 120.00%
    assert.equal(formatBasisPoints(coverageBps), '120.00%');

    const excess = calculateExcessReserves(reserves, liabilities);
    assert.equal(excess, 200_000_000n); // +2 BTC
    assert.equal(isSolvent(reserves, liabilities), true);
  });

  it('should flag insolvent datasets with red status and negative excess reserves', () => {
    const liabilities = 1_000_000_000n; // 10 BTC
    const reserves = 800_000_000n; // 8 BTC (Insolvent!)

    const coverageBps = calculateCoverageRatioBps(reserves, liabilities);
    assert.equal(coverageBps, 8_000); // 80.00%
    assert.equal(formatBasisPoints(coverageBps), '80.00%');

    const excess = calculateExcessReserves(reserves, liabilities);
    assert.equal(excess, -200_000_000n); // -2 BTC deficit
    assert.equal(isSolvent(reserves, liabilities), false);
  });

  it('should handle zero liabilities safely without division by zero', () => {
    const coverageBps = calculateCoverageRatioBps(0n, 0n);
    assert.equal(coverageBps, 10_000); // 100%

    const coveragePositive = calculateCoverageRatioBps(500_000_000n, 0n);
    assert.equal(coveragePositive, 999_999);
  });

  it('should generate valid synthetic customer dataset with requested options', () => {
    const dataset = generateSyntheticDataset({
      count: 16,
      seed: 777,
      reserveMultiplierBps: 12_000,
      includeZeroBalances: true,
    });

    assert.equal(dataset.records.length, 16);
    assert.ok(dataset.totalLiabilitiesSatoshis > 0n);
    assert.ok(dataset.declaredReservesSatoshis >= dataset.totalLiabilitiesSatoshis);

    const validation = validateDataset(dataset);
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);
  });

  it('should reject malformed datasets with negative balances', () => {
    const dataset = generateSyntheticDataset({ count: 16 });
    // Intentionally inject negative balance
    dataset.records[2].balanceSatoshis = -100n;

    const validation = validateDataset(dataset);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('negative balance')));
  });

  it('should reject datasets with duplicate customer identifiers', () => {
    const dataset = generateSyntheticDataset({ count: 16 });
    // Inject duplicate ID
    dataset.records[3].id = dataset.records[0].id;

    const validation = validateDataset(dataset);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('Duplicate customer identifier')));
  });
});
