/**
 * Financial calculations using safe integer arithmetic.
 * Never uses JavaScript floating point numbers for balance comparisons or solvency checks.
 */

export const SATOSHIS_PER_BTC = 100_000_000n;

/**
 * Maximum safe balance supported by 64-bit circuit constraints: 2^64 - 1
 * 18,446,744,073,709,551,615 satoshis = ~184 billion BTC (well exceeds 21 million BTC cap).
 */
export const MAX_BALANCE_SATOSHIS = 18_446_744_073_709_551_615n;

/**
 * BN254 scalar field prime
 */
export const BN254_FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Calculate excess reserves in satoshis: reserves - liabilities
 * Returns negative bigint if insolvent.
 */
export function calculateExcessReserves(
  declaredReserves: bigint,
  totalLiabilities: bigint
): bigint {
  return declaredReserves - totalLiabilities;
}

/**
 * Authoritative solvency check: declaredReserves >= totalLiabilities
 */
export function isSolvent(
  declaredReserves: bigint,
  totalLiabilities: bigint
): boolean {
  return declaredReserves >= totalLiabilities;
}

/**
 * Calculate coverage ratio in basis points (100% = 10,000 bps)
 * Handles zero liabilities safely without division by zero.
 */
export function calculateCoverageRatioBps(
  declaredReserves: bigint,
  totalLiabilities: bigint
): number {
  if (totalLiabilities === 0n) {
    return declaredReserves === 0n ? 10_000 : 999_999;
  }
  const ratio = (declaredReserves * 10_000n) / totalLiabilities;
  return Number(ratio);
}

/**
 * Format basis points to a human-readable percentage string, e.g. 12000 -> "120.00%"
 */
export function formatBasisPoints(bps: number): string {
  const isNegative = bps < 0;
  const absBps = Math.abs(bps);
  const integerPart = Math.floor(absBps / 100);
  const decimalPart = (absBps % 100).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${integerPart}.${decimalPart}%`;
}

/**
 * Format integer satoshis into precise BTC string representation without floating point inaccuracy.
 * e.g. 1,000,000,000n -> "10.00000000 BTC"
 */
export function formatSatoshisToBtc(satoshis: bigint): string {
  const isNegative = satoshis < 0n;
  const abs = isNegative ? -satoshis : satoshis;
  const btcWhole = abs / SATOSHIS_PER_BTC;
  const satsRemainder = abs % SATOSHIS_PER_BTC;
  const satsStr = satsRemainder.toString().padStart(8, '0');
  return `${isNegative ? '-' : ''}${btcWhole.toLocaleString('en-US')}.${satsStr} BTC`;
}

/**
 * Convert BTC string to satoshis using exact integer arithmetic.
 * e.g. "10.5" -> 1,050,000,000n
 */
export function parseBtcToSatoshis(btcStr: string): bigint {
  const trimmed = btcStr.trim().replace(/ BTC$/i, '');
  if (!/^-?\d+(\.\d{1,8})?$/.test(trimmed)) {
    throw new Error(`Invalid BTC format: "${btcStr}"`);
  }
  const isNegative = trimmed.startsWith('-');
  const clean = isNegative ? trimmed.slice(1) : trimmed;
  const parts = clean.split('.');
  const wholePart = BigInt(parts[0]);
  const fractionPart = parts[1] || '';
  const paddedFraction = fractionPart.padEnd(8, '0');
  const fractionSatoshis = BigInt(paddedFraction);
  const total = wholePart * SATOSHIS_PER_BTC + fractionSatoshis;
  return isNegative ? -total : total;
}
