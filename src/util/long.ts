/**
 * minecraft-protocol returns 64-bit longs in several shapes across versions/config:
 * a BigInt, a plain number, a [high, low] Int32 pair, or a {low, high} object.
 * Normalize to BigInt so TPS math is exact.
 */
export function longToBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (Array.isArray(v) && v.length === 2) {
    const [high, low] = v as [number, number];
    return (BigInt(high) << 32n) | BigInt(low >>> 0);
  }
  if (v && typeof v === "object") {
    const o = v as { low?: number; high?: number };
    if (o.low !== undefined && o.high !== undefined) {
      return (BigInt(o.high) << 32n) | BigInt(o.low >>> 0);
    }
  }
  return 0n;
}
