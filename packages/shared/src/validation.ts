/**
 * Runtime validation and sanitization for ReserveProof datasets and proof bundles.
 */

import { z } from 'zod';
import type { CustomerDataset, CustomerRecord, PublicProofBundle } from './types.js';
import { BN254_FIELD_PRIME, MAX_BALANCE_SATOSHIS } from './financial.js';

export const CustomerRecordSchema = z.object({
  id: z.string().min(1, 'Customer ID cannot be empty'),
  idNum: z.bigint().refine((val) => val > 0n && val < BN254_FIELD_PRIME, {
    message: 'idNum must be a valid non-zero BN254 field element',
  }),
  balanceSatoshis: z.bigint().refine((val) => val >= 0n && val <= MAX_BALANCE_SATOSHIS, {
    message: 'Balance must be non-negative and fit within 64 bits (<= 2^64 - 1)',
  }),
  salt: z.bigint().refine((val) => val > 0n && val < BN254_FIELD_PRIME, {
    message: 'Salt must be a valid non-zero BN254 field element',
  }),
});

export const PublicProofBundleSchema = z.object({
  version: z.string(),
  circuitId: z.string(),
  merkleRoot: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Merkle root must be a hex string starting with 0x'),
  totalLiabilitiesSatoshis: z.string().regex(/^\d+$/, 'totalLiabilitiesSatoshis must be decimal integer string'),
  declaredReservesSatoshis: z.string().regex(/^\d+$/, 'declaredReservesSatoshis must be decimal integer string'),
  datasetVersion: z.string().regex(/^\d+$/, 'datasetVersion must be decimal integer string'),
  publicSignals: z.array(z.string()).length(4, 'publicSignals must contain exactly 4 signals'),
  proof: z.object({
    pi_a: z.tuple([z.string(), z.string(), z.string()]),
    pi_b: z.tuple([
      z.tuple([z.string(), z.string()]),
      z.tuple([z.string(), z.string()]),
      z.tuple([z.string(), z.string()]),
    ]),
    pi_c: z.tuple([z.string(), z.string(), z.string()]),
    protocol: z.string(),
    curve: z.string(),
  }),
  calldata: z.object({
    a: z.tuple([z.string(), z.string()]),
    b: z.tuple([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string()])]),
    c: z.tuple([z.string(), z.string()]),
    input: z.array(z.string()).length(4),
  }).optional(),
  metadata: z.object({
    generatedAt: z.string(),
    customerCount: z.number(),
    coverageRatioBps: z.number(),
    isSolvent: z.boolean(),
    excessReservesSatoshis: z.string(),
  }),
});

/**
 * Validate customer dataset records
 */
export function validateDataset(dataset: CustomerDataset): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!dataset.records || dataset.records.length === 0) {
    errors.push('Dataset contains no customer records.');
    return { valid: false, errors };
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < dataset.records.length; i++) {
    const rec = dataset.records[i];
    if (seenIds.has(rec.id)) {
      errors.push(`Duplicate customer identifier detected at index ${i}: "${rec.id}"`);
    }
    seenIds.add(rec.id);

    if (rec.balanceSatoshis < 0n) {
      errors.push(`Customer "${rec.id}" has negative balance: ${rec.balanceSatoshis}`);
    }

    if (rec.balanceSatoshis > MAX_BALANCE_SATOSHIS) {
      errors.push(`Customer "${rec.id}" balance exceeds 64-bit circuit maximum: ${rec.balanceSatoshis}`);
    }

    if (rec.salt <= 0n || rec.salt >= BN254_FIELD_PRIME) {
      errors.push(`Customer "${rec.id}" salt is outside BN254 scalar field bounds.`);
    }
  }

  // Verify liability sum matches individual records
  const computedTotal = dataset.records.reduce((acc, curr) => acc + curr.balanceSatoshis, 0n);
  if (computedTotal !== dataset.totalLiabilitiesSatoshis) {
    errors.push(
      `Dataset totalLiabilitiesSatoshis (${dataset.totalLiabilitiesSatoshis}) does not match sum of individual balances (${computedTotal})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize and validate public proof bundle before persistence or verification.
 * Strictly guarantees that no private witness data or customer balances are present.
 */
export function sanitizePublicProofBundle(rawBundle: unknown): PublicProofBundle {
  const parsed = PublicProofBundleSchema.parse(rawBundle);

  // Deep check to ensure no prohibited keys leaked into the object
  const prohibitedKeys = [
    'customerId',
    'balance',
    'salt',
    'records',
    'witness',
    'privateKey',
    'secret',
  ];

  const jsonStr = JSON.stringify(rawBundle);
  for (const key of prohibitedKeys) {
    // Regex for prohibited key in json
    const regex = new RegExp(`"${key}"\\s*:`, 'i');
    if (regex.test(jsonStr)) {
      throw new Error(`SECURITY VIOLATION: Public proof bundle contains forbidden private key "${key}"`);
    }
  }

  return parsed as PublicProofBundle;
}
