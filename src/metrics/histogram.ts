/**
 * Percentiles via a plain sorted array. No dependency: at run-report volumes
 * (tens/hundreds of thousands of samples) this is fine.
 * ponytail: known ceiling is memory, not correctness — swap for hdr-histogram-js
 * only if a run must hold millions of live samples.
 */
export class Histogram {
  private readonly samples: number[] = [];

  record(v: number): void {
    this.samples.push(v);
  }

  get count(): number {
    return this.samples.length;
  }

  /** p in [0,1]. Nearest-rank on the sorted copy. Only called on a non-empty set (see summary). */
  private quantile(sorted: number[], p: number): number {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx]!;
  }

  summary(): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const n = this.samples.length;
    if (n === 0) return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      count: n,
      min: sorted[0]!,
      max: sorted[n - 1]!,
      mean: sum / n,
      p50: this.quantile(sorted, 0.5),
      p95: this.quantile(sorted, 0.95),
      p99: this.quantile(sorted, 0.99),
    };
  }
}
