import { TestBed } from '@angular/core/testing';
import { MonteCarloService } from './monte-carlo.service';
import type {
  Assembly,
  BomMatrix,
  ComponentDef,
  ScenarioDemandLine,
  SimulationSettings,
  UserScenario,
} from '../models/domain';

describe('MonteCarloService', () => {
  let service: MonteCarloService;

  const components: ComponentDef[] = [
    { id: 'partX', name: 'Part X', unit: 'units' },
    { id: 'partY', name: 'Part Y', unit: 'units' },
  ];

  const assemblies: Assembly[] = [
    { id: 'asmA', name: 'Assembly A', description: '' },
  ];

  const bom: BomMatrix = {
    asmA: { partX: 2, partY: 0 },
  };

  const settings: SimulationSettings = {
    iterations: 200,
    seed: 1,
    percentiles: [10, 25, 50, 75, 80, 90, 95],
    monthlyUncertaintyPct: 0.15,
    planningYear: 2026,
  };

  function scenario(lines: ScenarioDemandLine[]): UserScenario {
    return { id: 's1', name: 'Test', lines };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MonteCarloService);
  });

  it('explodes fixed assembly demand through the BOM exactly', () => {
    // 12 assembly units in January only → partX = 24, partY = 0
    const result = service.runUserScenario(
      scenario([
        {
          id: 'l1',
          assemblyId: 'asmA',
          quantity: 12,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          distribution: 'fixed',
        },
      ]),
      { ...settings, monthlyUncertaintyPct: 0.5 },
      { components, assemblies, bom },
    );

    const partX = result.componentAnnual.find((c) => c.componentId === 'partX');
    const partY = result.componentAnnual.find((c) => c.componentId === 'partY');
    expect(partX?.stats.mean).toBe(24);
    expect(partX?.stats.min).toBe(24);
    expect(partX?.stats.max).toBe(24);
    expect(partY?.stats.mean).toBe(0);

    const janX = result.componentByMonth.find(
      (r) => r.componentId === 'partX' && r.month === 1,
    );
    expect(janX?.stats.mean).toBe(24);
  });

  it('is reproducible for the same seed and inputs', () => {
    const input = scenario([
      {
        id: 'l1',
        assemblyId: 'asmA',
        quantity: 100,
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        distribution: 'triangular',
      },
    ]);
    const catalog = { components, assemblies, bom };
    const a = service.runUserScenario(input, settings, catalog);
    const b = service.runUserScenario(input, settings, catalog);

    expect(a.componentAnnual).toEqual(b.componentAnnual);
    expect(a.componentByMonth).toEqual(b.componentByMonth);
  });

  it('throws when components catalog is empty', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'asmA',
            quantity: 1,
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            distribution: 'fixed',
          },
        ]),
        settings,
        { components: [], assemblies, bom },
      ),
    ).toThrow(/component/i);
  });

  it('throws when assemblies catalog is empty', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'asmA',
            quantity: 1,
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            distribution: 'fixed',
          },
        ]),
        settings,
        { components, assemblies: [], bom },
      ),
    ).toThrow(/assembly/i);
  });

  it('throws on invalid demand lines', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'missing',
            quantity: 10,
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            distribution: 'fixed',
          },
        ]),
        settings,
        { components, assemblies, bom },
      ),
    ).toThrow(/valid assembly|Line 1/i);
  });

  it('throws when no demand falls in the planning year', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'asmA',
            quantity: 10,
            startDate: '2025-01-01',
            endDate: '2025-06-30',
            distribution: 'fixed',
          },
        ]),
        settings,
        { components, assemblies, bom },
      ),
    ).toThrow(/planning year/i);
  });

  it('returns months 1–12 and percentile keys for UI/export', () => {
    const result = service.runUserScenario(
      scenario([
        {
          id: 'l1',
          assemblyId: 'asmA',
          quantity: 24,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          distribution: 'fixed',
        },
      ]),
      settings,
      { components, assemblies, bom },
    );

    expect(result.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.componentAnnual.map((c) => c.componentId).sort()).toEqual([
      'partX',
      'partY',
    ]);
    const p = result.componentAnnual[0].stats.percentiles;
    for (const key of ['p50', 'p80', 'p90', 'p95']) {
      expect(p[key]).toBeDefined();
    }
  });
});
