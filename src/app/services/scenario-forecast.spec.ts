import {
  allocateQuantityByYear,
  buildForecastFromLines,
  normalizeDistribution,
  validateDemandLines,
} from './scenario-forecast';
import type { Assembly, ScenarioDemandLine } from '../models/domain';
import { planningYears } from '../data/mvp-seed';

const assemblies: Assembly[] = [
  { id: 'a1', name: 'Assembly One', description: '' },
  { id: 'a2', name: 'Assembly Two', description: '' },
];

const HORIZON_START = 2026;
const HORIZON_LEN = 15;
const HORIZON = planningYears(HORIZON_START, HORIZON_LEN);

function line(
  partial: Partial<ScenarioDemandLine> & Pick<ScenarioDemandLine, 'id'>,
): ScenarioDemandLine {
  return {
    assemblyId: 'a1',
    quantity: 100,
    startYear: HORIZON_START,
    endYear: HORIZON_START + HORIZON_LEN - 1,
    distribution: 'fixed',
    ...partial,
  };
}

describe('allocateQuantityByYear', () => {
  it('sums to quantity across the full horizon', () => {
    const qty = 150;
    const yearly = allocateQuantityByYear(
      qty,
      HORIZON_START,
      HORIZON_START + HORIZON_LEN - 1,
      HORIZON,
    );
    let sum = 0;
    for (const v of yearly.values()) sum += v;
    expect(sum).toBe(qty);
  });

  it('only allocates years that overlap the range', () => {
    const yearly = allocateQuantityByYear(90, 2028, 2030, HORIZON);
    expect(yearly.get(2026)).toBe(0);
    expect(yearly.get(2027)).toBe(0);
    expect(
      (yearly.get(2028) ?? 0) +
        (yearly.get(2029) ?? 0) +
        (yearly.get(2030) ?? 0),
    ).toBe(90);
    expect(yearly.get(2031)).toBe(0);
  });

  it('puts all quantity in one year for a single-year range', () => {
    const yearly = allocateQuantityByYear(50, 2032, 2032, HORIZON);
    expect(yearly.get(2032)).toBe(50);
    let sum = 0;
    for (const v of yearly.values()) sum += v;
    expect(sum).toBe(50);
  });

  it('returns zeros when range is outside the planning horizon', () => {
    const yearly = allocateQuantityByYear(100, 2000, 2005, HORIZON);
    for (const v of yearly.values()) {
      expect(v).toBe(0);
    }
  });

  it('returns zeros for reversed years', () => {
    const yearly = allocateQuantityByYear(100, 2030, 2026, HORIZON);
    for (const v of yearly.values()) {
      expect(v).toBe(0);
    }
  });

  it('spreads evenly across equal years', () => {
    // 3 years, 30 units → 10 each
    const yearly = allocateQuantityByYear(30, 2026, 2028, HORIZON);
    expect(yearly.get(2026)).toBe(10);
    expect(yearly.get(2027)).toBe(10);
    expect(yearly.get(2028)).toBe(10);
  });

  it('uses largest remainder so totals still sum when uneven', () => {
    // 3 years, 10 units → 4, 3, 3
    const yearly = allocateQuantityByYear(10, 2026, 2028, HORIZON);
    let sum = 0;
    for (const y of [2026, 2027, 2028]) {
      sum += yearly.get(y) ?? 0;
    }
    expect(sum).toBe(10);
    expect(Math.max(...[2026, 2027, 2028].map((y) => yearly.get(y) ?? 0))).toBe(
      4,
    );
  });
});

describe('validateDemandLines', () => {
  it('rejects empty lines', () => {
    const issues = validateDemandLines([], HORIZON_START, HORIZON_LEN, assemblies);
    expect(issues.some((i) => i.path === 'lines')).toBe(true);
  });

  it('rejects when catalog has no assemblies', () => {
    const issues = validateDemandLines(
      [line({ id: '1' })],
      HORIZON_START,
      HORIZON_LEN,
      [],
    );
    expect(issues.some((i) => i.path === 'catalog')).toBe(true);
  });

  it('rejects unknown assembly id', () => {
    const issues = validateDemandLines(
      [line({ id: '1', assemblyId: 'missing' })],
      HORIZON_START,
      HORIZON_LEN,
      assemblies,
    );
    expect(issues.some((i) => /valid assembly/i.test(i.message))).toBe(true);
  });

  it('rejects negative and non-integer quantities', () => {
    expect(
      validateDemandLines(
        [line({ id: '1', quantity: -1 })],
        HORIZON_START,
        HORIZON_LEN,
        assemblies,
      ).some((i) => /nonnegative/i.test(i.message)),
    ).toBe(true);

    expect(
      validateDemandLines(
        [line({ id: '1', quantity: 1.5 })],
        HORIZON_START,
        HORIZON_LEN,
        assemblies,
      ).some((i) => /whole number/i.test(i.message)),
    ).toBe(true);
  });

  it('rejects end year before start year', () => {
    const issues = validateDemandLines(
      [
        line({
          id: '1',
          startYear: 2030,
          endYear: 2026,
        }),
      ],
      HORIZON_START,
      HORIZON_LEN,
      assemblies,
    );
    expect(issues.some((i) => /on or after start/i.test(i.message))).toBe(
      true,
    );
  });

  it('rejects ranges that do not overlap the horizon', () => {
    const issues = validateDemandLines(
      [line({ id: '1', startYear: 1990, endYear: 1995 })],
      HORIZON_START,
      HORIZON_LEN,
      assemblies,
    );
    expect(issues.some((i) => /planning horizon/i.test(i.message))).toBe(true);
  });

  it('accepts a valid line', () => {
    const issues = validateDemandLines(
      [line({ id: '1', quantity: 10 })],
      HORIZON_START,
      HORIZON_LEN,
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
          startYear: 2026,
          endYear: 2026,
          distribution: 'fixed',
        }),
      ],
      HORIZON_START,
      HORIZON_LEN,
      0.15,
    );
    expect(cells.length).toBe(1);
    expect(cells[0].year).toBe(2026);
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
          startYear: 2026,
          endYear: 2026,
          distribution: 'triangular',
        }),
      ],
      HORIZON_START,
      HORIZON_LEN,
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
          startYear: 2026,
          endYear: 2026,
          distribution: 'uniform',
        }),
      ],
      HORIZON_START,
      HORIZON_LEN,
      0,
    );
    expect(cells[0].distribution).toBe('fixed');
    expect(cells[0].min).toBe(cells[0].max);
  });

  it('creates separate cells for multiple lines in the same year/assembly', () => {
    const cells = buildForecastFromLines(
      [
        line({
          id: '1',
          quantity: 10,
          startYear: 2026,
          endYear: 2026,
          distribution: 'fixed',
        }),
        line({
          id: '2',
          quantity: 5,
          startYear: 2026,
          endYear: 2026,
          distribution: 'triangular',
        }),
      ],
      HORIZON_START,
      HORIZON_LEN,
      0.1,
    );
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.year === 2026 && c.assemblyId === 'a1')).toBe(
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
