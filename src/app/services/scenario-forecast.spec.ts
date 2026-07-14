import {
  allocateQuantityByMonth,
  buildForecastFromLines,
  normalizeDistribution,
  validateDemandLines,
} from './scenario-forecast';
import type { Assembly, ScenarioDemandLine } from '../models/domain';

const assemblies: Assembly[] = [
  { id: 'a1', name: 'Assembly One', description: '' },
  { id: 'a2', name: 'Assembly Two', description: '' },
];

function line(
  partial: Partial<ScenarioDemandLine> & Pick<ScenarioDemandLine, 'id'>,
): ScenarioDemandLine {
  return {
    assemblyId: 'a1',
    quantity: 100,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    distribution: 'fixed',
    ...partial,
  };
}

describe('allocateQuantityByMonth', () => {
  it('sums to quantity across a full year', () => {
    const qty = 365;
    const monthly = allocateQuantityByMonth(
      qty,
      '2026-01-01',
      '2026-12-31',
      2026,
    );
    let sum = 0;
    for (const v of monthly.values()) sum += v;
    expect(sum).toBe(qty);
  });

  it('only allocates months that overlap the range', () => {
    const monthly = allocateQuantityByMonth(
      90,
      '2026-03-01',
      '2026-05-31',
      2026,
    );
    expect(monthly.get(1)).toBe(0);
    expect(monthly.get(2)).toBe(0);
    expect(monthly.get(3)! + monthly.get(4)! + monthly.get(5)!).toBe(90);
    expect(monthly.get(6)).toBe(0);
  });

  it('puts all quantity in one month for a single-day range', () => {
    const monthly = allocateQuantityByMonth(
      50,
      '2026-07-15',
      '2026-07-15',
      2026,
    );
    expect(monthly.get(7)).toBe(50);
    let sum = 0;
    for (const v of monthly.values()) sum += v;
    expect(sum).toBe(50);
  });

  it('returns zeros when range is outside planning year', () => {
    const monthly = allocateQuantityByMonth(
      100,
      '2025-01-01',
      '2025-06-30',
      2026,
    );
    for (const v of monthly.values()) {
      expect(v).toBe(0);
    }
  });

  it('returns zeros for reversed dates', () => {
    const monthly = allocateQuantityByMonth(
      100,
      '2026-06-01',
      '2026-01-01',
      2026,
    );
    for (const v of monthly.values()) {
      expect(v).toBe(0);
    }
  });

  it('returns zeros for invalid dates', () => {
    const monthly = allocateQuantityByMonth(
      100,
      'not-a-date',
      '2026-12-31',
      2026,
    );
    for (const v of monthly.values()) {
      expect(v).toBe(0);
    }
  });

  it('gives more weight to months with more overlapping days', () => {
    // Feb has fewer days than March in a non-leap-ish setup — use Apr (30) vs May (31)
    // over a range covering full Apr and full May with equal calendar presence
    const monthly = allocateQuantityByMonth(
      610,
      '2026-04-01',
      '2026-05-31',
      2026,
    );
    // May has 31 days, Apr 30 → May should get more or equal after rounding
    expect(monthly.get(5)!).toBeGreaterThanOrEqual(monthly.get(4)!);
    expect((monthly.get(4) ?? 0) + (monthly.get(5) ?? 0)).toBe(610);
  });
});

describe('validateDemandLines', () => {
  it('rejects empty lines', () => {
    const issues = validateDemandLines([], 2026, assemblies);
    expect(issues.some((i) => i.path === 'lines')).toBe(true);
  });

  it('rejects when catalog has no assemblies', () => {
    const issues = validateDemandLines(
      [line({ id: '1' })],
      2026,
      [],
    );
    expect(issues.some((i) => i.path === 'catalog')).toBe(true);
  });

  it('rejects unknown assembly id', () => {
    const issues = validateDemandLines(
      [line({ id: '1', assemblyId: 'missing' })],
      2026,
      assemblies,
    );
    expect(issues.some((i) => /valid assembly/i.test(i.message))).toBe(true);
  });

  it('rejects negative and non-integer quantities', () => {
    expect(
      validateDemandLines(
        [line({ id: '1', quantity: -1 })],
        2026,
        assemblies,
      ).some((i) => /nonnegative/i.test(i.message)),
    ).toBe(true);

    expect(
      validateDemandLines(
        [line({ id: '1', quantity: 1.5 })],
        2026,
        assemblies,
      ).some((i) => /whole number/i.test(i.message)),
    ).toBe(true);
  });

  it('rejects end before start', () => {
    const issues = validateDemandLines(
      [
        line({
          id: '1',
          startDate: '2026-06-01',
          endDate: '2026-01-01',
        }),
      ],
      2026,
      assemblies,
    );
    expect(issues.some((i) => /on or after start/i.test(i.message))).toBe(
      true,
    );
  });

  it('accepts a valid line', () => {
    const issues = validateDemandLines(
      [line({ id: '1', quantity: 10 })],
      2026,
      assemblies,
    );
    expect(issues).toEqual([]);
  });
});

describe('buildForecastFromLines', () => {
  it('uses fixed band when distribution is fixed even with uncertainty', () => {
    const cells = buildForecastFromLines(
      [
        line({
          id: '1',
          quantity: 12,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'fixed',
        }),
      ],
      2026,
      0.15,
    );
    expect(cells.length).toBe(1);
    expect(cells[0].distribution).toBe('fixed');
    expect(cells[0].min).toBe(cells[0].expected);
    expect(cells[0].max).toBe(cells[0].expected);
    expect(cells[0].expected).toBe(12);
  });

  it('applies uncertainty band for triangular', () => {
    const cells = buildForecastFromLines(
      [
        line({
          id: '1',
          quantity: 100,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'triangular',
        }),
      ],
      2026,
      0.15,
    );
    expect(cells[0].distribution).toBe('triangular');
    expect(cells[0].min).toBeLessThan(cells[0].expected);
    expect(cells[0].max).toBeGreaterThan(cells[0].expected);
  });

  it('collapses to fixed when uncertainty is 0', () => {
    const cells = buildForecastFromLines(
      [
        line({
          id: '1',
          quantity: 50,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'uniform',
        }),
      ],
      2026,
      0,
    );
    expect(cells[0].distribution).toBe('fixed');
    expect(cells[0].min).toBe(cells[0].max);
  });

  it('creates separate cells for multiple lines in the same month/assembly', () => {
    const cells = buildForecastFromLines(
      [
        line({
          id: '1',
          quantity: 10,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'fixed',
        }),
        line({
          id: '2',
          quantity: 5,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'triangular',
        }),
      ],
      2026,
      0.1,
    );
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.month === 1 && c.assemblyId === 'a1')).toBe(
      true,
    );
  });
});

describe('normalizeDistribution', () => {
  it('passes through known types', () => {
    expect(normalizeDistribution('fixed')).toBe('fixed');
    expect(normalizeDistribution('uniform')).toBe('uniform');
    expect(normalizeDistribution('triangular')).toBe('triangular');
  });

  it('defaults unknown values to triangular', () => {
    expect(normalizeDistribution(undefined)).toBe('triangular');
    expect(normalizeDistribution('nope')).toBe('triangular');
  });
});
