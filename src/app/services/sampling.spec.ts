import { SeededRng } from './rng';
import {
  roundComponentQty,
  sampleBuildQuantity,
  validateDistribution,
} from './sampling';

describe('validateDistribution', () => {
  it('rejects non-finite values', () => {
    const issues = validateDistribution({
      distribution: 'fixed',
      expected: Number.NaN,
      min: 0,
      max: 1,
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toMatch(/finite/i);
  });

  it('rejects negative min', () => {
    const issues = validateDistribution({
      distribution: 'uniform',
      expected: 5,
      min: -1,
      max: 10,
    });
    expect(issues.some((i) => /nonnegative/i.test(i.message))).toBe(true);
  });

  it('rejects max < min', () => {
    const issues = validateDistribution({
      distribution: 'uniform',
      expected: 5,
      min: 10,
      max: 3,
    });
    expect(issues.some((i) => /greater than or equal/i.test(i.message))).toBe(
      true,
    );
  });

  it('rejects triangular mode outside [min, max]', () => {
    const issues = validateDistribution({
      distribution: 'triangular',
      expected: 20,
      min: 0,
      max: 10,
    });
    expect(issues.some((i) => /between min and max/i.test(i.message))).toBe(
      true,
    );
  });

  it('rejects fixed expected when negative', () => {
    const issues = validateDistribution({
      distribution: 'fixed',
      expected: -3,
      min: 0,
      max: 0,
    });
    expect(issues.some((i) => /nonnegative/i.test(i.message))).toBe(true);
  });

  it('accepts a valid triangular distribution', () => {
    const issues = validateDistribution({
      distribution: 'triangular',
      expected: 5,
      min: 0,
      max: 10,
    });
    expect(issues).toEqual([]);
  });
});

describe('sampleBuildQuantity', () => {
  it('returns expected for fixed distribution', () => {
    const rng = new SeededRng(1);
    const q = sampleBuildQuantity(
      { distribution: 'fixed', expected: 42, min: 0, max: 100 },
      rng,
    );
    expect(q).toBe(42);
  });

  it('keeps uniform samples within [min, max] over many draws', () => {
    const rng = new SeededRng(99);
    const min = 10;
    const max = 20;
    for (let i = 0; i < 500; i++) {
      const q = sampleBuildQuantity(
        { distribution: 'uniform', expected: 15, min, max },
        rng,
      );
      expect(q).toBeGreaterThanOrEqual(min);
      expect(q).toBeLessThanOrEqual(max);
      expect(Number.isInteger(q)).toBe(true);
    }
  });

  it('keeps triangular samples within [min, max]', () => {
    const rng = new SeededRng(7);
    const min = 0;
    const max = 100;
    for (let i = 0; i < 500; i++) {
      const q = sampleBuildQuantity(
        { distribution: 'triangular', expected: 50, min, max },
        rng,
      );
      expect(q).toBeGreaterThanOrEqual(min);
      expect(q).toBeLessThanOrEqual(max);
    }
  });

  it('handles min === max by returning that value', () => {
    const rng = new SeededRng(3);
    const q = sampleBuildQuantity(
      { distribution: 'uniform', expected: 8, min: 8, max: 8 },
      rng,
    );
    expect(q).toBe(8);
  });

  it('never returns negative after rounding', () => {
    const rng = new SeededRng(11);
    const q = sampleBuildQuantity(
      { distribution: 'fixed', expected: -0.4, min: 0, max: 0 },
      rng,
    );
    // fixed returns expected then round/max(0)
    expect(q).toBeGreaterThanOrEqual(0);
  });
});

describe('roundComponentQty', () => {
  it('rounds to nearest nonnegative integer', () => {
    expect(roundComponentQty(2.4)).toBe(2);
    expect(roundComponentQty(2.6)).toBe(3);
    expect(roundComponentQty(-1.2)).toBe(0);
  });
});
