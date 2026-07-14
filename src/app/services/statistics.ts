import { StatSummary } from '../models/domain';

export function computeStats(
  values: number[],
  percentileLevels: number[],
): StatSummary {
  if (values.length === 0) {
    return {
      mean: 0,
      stdDev: 0,
      cv: 0,
      min: 0,
      max: 0,
      percentiles: Object.fromEntries(
        percentileLevels.map((p) => [`p${p}`, 0]),
      ),
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((sum, v) => sum + v, 0) / n;

  let variance = 0;
  for (const v of sorted) {
    const d = v - mean;
    variance += d * d;
  }
  // Population std for Monte Carlo summary (full simulated distribution)
  variance /= n;
  const stdDev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdDev / mean;

  const percentiles: Record<string, number> = {};
  for (const p of percentileLevels) {
    percentiles[`p${p}`] = quantileSorted(sorted, p / 100);
  }

  return {
    mean,
    stdDev,
    cv,
    min: sorted[0],
    max: sorted[n - 1],
    percentiles,
  };
}

/** Linear interpolation quantile on a pre-sorted array. p in [0, 1]. */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const clamped = Math.min(1, Math.max(0, p));
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];

  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString();
}
