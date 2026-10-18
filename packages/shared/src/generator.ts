/**
 * Synthetic exchange customer dataset generator.
 * Generates deterministic or randomized customer balance datasets with zero personal information.
 */

import type { CustomerDataset, CustomerRecord } from './types.js';
import { BN254_FIELD_PRIME, MAX_BALANCE_SATOSHIS, SATOSHIS_PER_BTC } from './financial.js';

export interface DatasetGeneratorOptions {
  /** Desired customer count (typically 16 for circuit capacity, or 10/50/100) */
  count?: number;
  /** PRNG seed for deterministic test datasets */
  seed?: number;
  /** Minimum customer balance in satoshis */
  minBalanceSatoshis?: bigint;
  /** Maximum customer balance in satoshis */
  maxBalanceSatoshis?: bigint;
  /** Whether to intentionally inject zero-balance accounts */
  includeZeroBalances?: boolean;
  /** Whether to generate an insolvent dataset (declaredReserves < totalLiabilities) */
  insufficientReserves?: boolean;
  /** Reserve multiplier in basis points (e.g. 12000 for 120% coverage) */
  reserveMultiplierBps?: number;
  /** Dataset version / epoch number */
  datasetVersion?: bigint;
}

/**
 * Deterministic Mulberry32 32-bit PRNG
 */
class Mulberry32 {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  public next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextBigInt(max: bigint): bigint {
    const r1 = BigInt(Math.floor(this.next() * 0x100000000));
    const r2 = BigInt(Math.floor(this.next() * 0x100000000));
    const combined = (r1 << 32n) | r2;
    return combined % max;
  }
}

/**
 * Simple string hash to field element
 */
function hashStringToField(str: string): bigint {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    const charCode = BigInt(str.charCodeAt(i));
    hash = (hash * 31n + charCode) % (BN254_FIELD_PRIME - 1n);
  }
  return hash + 1n; // non-zero
}

export const CIRCUIT_CAPACITY = 16;

/**
 * Generate synthetic exchange customer dataset.
 */
export function generateSyntheticDataset(
  options: DatasetGeneratorOptions = {}
): CustomerDataset {
  const count = options.count ?? 16;
  const seed = options.seed ?? 1337;
  const prng = new Mulberry32(seed);

  const minBal = options.minBalanceSatoshis ?? (50_000_000n); // 0.5 BTC
  const maxBal = options.maxBalanceSatoshis ?? (500_000_000n); // 5.0 BTC
  const includeZero = options.includeZeroBalances ?? false;
  const insufficientReserves = options.insufficientReserves ?? false;
  const reserveBps = options.reserveMultiplierBps ?? 12_000; // 120%
  const version = options.datasetVersion ?? 1n;

  // Canonical base records for Alice, Bob, Charlie, David
  const canonicalNames = [
    { name: 'cust_001_alice', balance: 200_000_000n }, // 2.0 BTC
    { name: 'cust_002_bob', balance: 300_000_000n },   // 3.0 BTC
    { name: 'cust_003_charlie', balance: 100_000_000n }, // 1.0 BTC
    { name: 'cust_004_david', balance: 400_000_000n }, // 4.0 BTC
  ];

  const records: CustomerRecord[] = [];
  const targetCount = CIRCUIT_CAPACITY; // Fixed 16-leaf circuit capacity

  for (let i = 0; i < targetCount; i++) {
    const customerId = `cust_${(i + 1).toString().padStart(3, '0')}`;
    const idNum = hashStringToField(customerId);

    // Generate random 128-bit salt for commitment hiding
    const salt = prng.nextBigInt(1n << 128n) + 1n;

    let balanceSatoshis: bigint;

    if (i < 4 && count <= 16) {
      // Use canonical balances for initial 4 accounts
      balanceSatoshis = canonicalNames[i].balance;
    } else if (i >= count) {
      // Pad inactive accounts with 0 balance
      balanceSatoshis = 0n;
    } else if (includeZero && i === 5) {
      // Intentionally insert zero balance for edge-case testing
      balanceSatoshis = 0n;
    } else {
      const range = maxBal > minBal ? maxBal - minBal : 100_000_000n;
      balanceSatoshis = minBal + prng.nextBigInt(range);
    }

    if (balanceSatoshis < 0n || balanceSatoshis > MAX_BALANCE_SATOSHIS) {
      throw new Error(`Generated balance ${balanceSatoshis} out of permitted range`);
    }

    records.push({
      id: customerId,
      idNum,
      balanceSatoshis,
      salt,
    });
  }

  // Calculate exact total liabilities
  const totalLiabilitiesSatoshis = records.reduce(
    (acc, curr) => acc + curr.balanceSatoshis,
    0n
  );

  // Calculate declared reserves
  let declaredReservesSatoshis: bigint;
  if (insufficientReserves) {
    // Intentionally insolvent: 80% coverage (20% deficit)
    declaredReservesSatoshis = (totalLiabilitiesSatoshis * 8_000n) / 10_000n;
  } else {
    // Solvent: e.g. 120% coverage
    declaredReservesSatoshis = (totalLiabilitiesSatoshis * BigInt(reserveBps)) / 10_000n;
  }

  return {
    version,
    timestamp: Math.floor(Date.now() / 1000),
    records,
    totalLiabilitiesSatoshis,
    declaredReservesSatoshis,
  };
}
