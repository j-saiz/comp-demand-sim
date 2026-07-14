import {
  computeStats,
  formatInteger,
  formatNumber,
  formatPercent,
  quantileSorted,
} from './statistics';

describe('quantileSorted', () => {
  it('returns 0 for empty array', () => {
    expect(quantileSorted([], 0.5)).toBe(0);
  });

  it('returns the only value for a single-element array', () => {
    expect(quantileSorted([7], 0.9)).toBe(7);
  });

  it('returns endpoints at p=0 and p=1', () => {
    const sorted = [1, 2, 3, 4];
    expect(quantileSorted(sorted, 0)).toBe(1);
    expect(quantileSorted(sorted, 1)).toBe(4);
  });

  it('interpolates mid percentiles', () => {
    // For [10, 20], p=0.5 → midpoint 15
    expect(quantileSorted([10, 20], 0.5)).toBe(15);
  });

  it('clamps p outside [0, 1]', () => {
    const sorted = [1, 2, 3];
    expect(quantileSorted(sorted, -1)).toBe(1);
    expect(quantileSorted(sorted, 2)).toBe(3);
  });
});

describe('computeStats', () => {
  it('returns zero summary for empty values', () => {
    const stats = computeStats([], [50, 90]);
    expect(stats.mean).toBe(0);
    expect(stats.stdDev).toBe(0);
    expect(stats.cv).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.percentiles['p50']).toBe(0);
    expect(stats.percentiles['p90']).toBe(0);
  });

  it('computes mean, min, max on a known set', () => {
    const stats = computeStats([2, 4, 4, 4, 5, 5, 7, 9], [50]);
    expect(stats.mean).toBe(5);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(9);
  });

  it('computes population standard deviation for a tiny set', () => {
    // values [2, 4], mean 3, variance ((1)^2+(1)^2)/2 = 1, stdDev = 1
    const stats = computeStats([2, 4], [50]);
    expect(stats.mean).toBe(3);
    expect(stats.stdDev).toBeCloseTo(1, 10);
    expect(stats.cv).toBeCloseTo(1 / 3, 10);
  });

  it('has CV 0 when all values are equal', () => {
    const stats = computeStats([5, 5, 5], [50, 90]);
    expect(stats.cv).toBe(0);
    expect(stats.stdDev).toBe(0);
  });

  it('has CV 0 when mean is 0', () => {
    const stats = computeStats([0, 0, 0], [50]);
    expect(stats.mean).toBe(0);
    expect(stats.cv).toBe(0);
  });

  it('exposes requested percentile keys', () => {
    const stats = computeStats([1, 2, 3, 4, 5], [10, 50, 90, 95]);
    expect(stats.percentiles['p10']).toBeDefined();
    expect(stats.percentiles['p50']).toBe(3);
    expect(stats.percentiles['p90']).toBeDefined();
    expect(stats.percentiles['p95']).toBeDefined();
  });
});

describe('formatters', () => {
  it('formatNumber returns em dash for non-finite', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formatPercent formats fractions as percents', () => {
    expect(formatPercent(0.153, 1)).toBe('15.3%');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('formatInteger rounds and localizes finite values', () => {
    expect(formatInteger(12.6)).toBe((13).toLocaleString());
    expect(formatInteger(Number.NaN)).toBe('—');
  });
});
