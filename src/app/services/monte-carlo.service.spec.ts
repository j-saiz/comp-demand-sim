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
    yearlyUncertaintyPct: 0.15,
    planningStartYear: 2026,
    planningHorizonYears: 15,
  };

  function scenario(lines: ScenarioDemandLine[]): UserScenario {
    return { id: 's1', name: 'Test', lines };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MonteCarloService);
  });

  it('explodes fixed assembly demand through the BOM exactly', () => {
    // 12 assembly units in 2026 only → partX = 24, partY = 0
    const result = service.runUserScenario(
      scenario([
        {
          id: 'l1',
          assemblyId: 'asmA',
          quantity: 12,
          startYear: 2026,
          endYear: 2026,
          distribution: 'fixed',
        },
      ]),
      { ...settings, yearlyUncertaintyPct: 0.5 },
      { components, assemblies, bom },
    );

    const partX = result.componentHorizon.find(
      (c) => c.componentId === 'partX',
    );
    const partY = result.componentHorizon.find(
      (c) => c.componentId === 'partY',
    );
    expect(partX?.stats.mean).toBe(24);
    expect(partX?.stats.min).toBe(24);
    expect(partX?.stats.max).toBe(24);
    expect(partY?.stats.mean).toBe(0);

    const yearX = result.componentByYear.find(
      (r) => r.componentId === 'partX' && r.year === 2026,
    );
    expect(yearX?.stats.mean).toBe(24);
  });

  it('is reproducible for the same seed and inputs', () => {
    const input = scenario([
      {
        id: 'l1',
        assemblyId: 'asmA',
        quantity: 100,
        startYear: 2026,
        endYear: 2030,
        distribution: 'triangular',
      },
    ]);
    const catalog = { components, assemblies, bom };
    const a = service.runUserScenario(input, settings, catalog);
    const b = service.runUserScenario(input, settings, catalog);

    expect(a.componentHorizon).toEqual(b.componentHorizon);
    expect(a.componentByYear).toEqual(b.componentByYear);
  });

  it('throws when components catalog is empty', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'asmA',
            quantity: 1,
            startYear: 2026,
            endYear: 2026,
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
            startYear: 2026,
            endYear: 2026,
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
            startYear: 2026,
            endYear: 2026,
            distribution: 'fixed',
          },
        ]),
        settings,
        { components, assemblies, bom },
      ),
    ).toThrow(/valid assembly|Line 1/i);
  });

  it('throws when no demand falls in the planning horizon', () => {
    expect(() =>
      service.runUserScenario(
        scenario([
          {
            id: 'l1',
            assemblyId: 'asmA',
            quantity: 10,
            startYear: 2000,
            endYear: 2005,
            distribution: 'fixed',
          },
        ]),
        settings,
        { components, assemblies, bom },
      ),
    ).toThrow(/planning horizon/i);
  });

  it('returns horizon years and percentile keys for UI/export', () => {
    const result = service.runUserScenario(
      scenario([
        {
          id: 'l1',
          assemblyId: 'asmA',
          quantity: 24,
          startYear: 2026,
          endYear: 2040,
          distribution: 'fixed',
        },
      ]),
      settings,
      { components, assemblies, bom },
    );

    expect(result.years).toEqual(
      Array.from({ length: 15 }, (_, i) => 2026 + i),
    );
    expect(result.planningHorizonYears).toBe(15);
    expect(result.planningStartYear).toBe(2026);
    expect(result.componentHorizon.map((c) => c.componentId).sort()).toEqual([
      'partX',
      'partY',
    ]);
    const p = result.componentHorizon[0].stats.percentiles;
    for (const key of ['p50', 'p80', 'p90', 'p95']) {
      expect(p[key]).toBeDefined();
    }
  });
});
