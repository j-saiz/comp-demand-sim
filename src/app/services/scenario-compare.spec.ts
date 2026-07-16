import {
  buildAnnualDeltas,
  rankByDeltaP90,
  summarizeScenarios,
  yearlyMeansByScenario,
} from './scenario-compare';
import type { ScenarioResultView } from '../models/domain';

function mockResult(
  id: string,
  name: string,
  components: { id: string; name: string; mean: number; p90: number }[],
): ScenarioResultView {
  return {
    scenarioId: id,
    scenarioName: name,
    iterations: 100,
    seed: 1,
    years: [2026, 2027],
    planningStartYear: 2026,
    planningHorizonYears: 2,
    lines: [
      {
        id: 'l1',
        assemblyId: 'a',
        quantity: 10,
        startYear: 2026,
        endYear: 2027,
        distribution: 'fixed',
      },
    ],
    yearlyAllocation: [],
    componentHorizon: components.map((c) => ({
      componentId: c.id,
      componentName: c.name,
      stats: {
        mean: c.mean,
        stdDev: 0,
        cv: 0,
        min: c.mean,
        max: c.mean,
        percentiles: { p90: c.p90, p50: c.mean },
      },
    })),
    componentByYear: components.flatMap((c) =>
      [2026, 2027].map((year) => ({
        componentId: c.id,
        componentName: c.name,
        year,
        stats: {
          mean: c.mean / 2,
          stdDev: 0,
          cv: 0,
          min: 0,
          max: 0,
          percentiles: {},
        },
      })),
    ),
    cvRanking: [],
    yearlyBands: {},
  };
}

describe('scenario-compare', () => {
  const baseline = mockResult('base', 'Baseline', [
    { id: 'cpu', name: 'CPU', mean: 100, p90: 120 },
    { id: 'gpu', name: 'GPU', mean: 50, p90: 60 },
  ]);
  const high = mockResult('high', 'High', [
    { id: 'cpu', name: 'CPU', mean: 125, p90: 160 },
    { id: 'gpu', name: 'GPU', mean: 55, p90: 62 },
  ]);

  it('buildAnnualDeltas computes means, p90s, and deltas vs baseline', () => {
    const rows = buildAnnualDeltas([baseline, high], 'base');
    const cpu = rows.find((r) => r.componentId === 'cpu')!;
    expect(cpu.means['base']).toBe(100);
    expect(cpu.means['high']).toBe(125);
    expect(cpu.p90s['high']).toBe(160);
    expect(cpu.deltaMean).toBe(25);
    expect(cpu.deltaP90).toBe(40);
    expect(cpu.deltaMeanPct).toBeCloseTo(0.25);
  });

  it('rankByDeltaP90 orders by absolute P90 swing', () => {
    const ranked = rankByDeltaP90(buildAnnualDeltas([baseline, high], 'base'));
    expect(ranked[0].componentId).toBe('cpu');
    expect(ranked[1].componentId).toBe('gpu');
  });

  it('summarizeScenarios returns unit totals', () => {
    const meta = summarizeScenarios([baseline, high]);
    expect(meta).toHaveLength(2);
    expect(meta[0].totalAssemblyUnits).toBe(10);
    expect(meta[0].lineCount).toBe(1);
  });

  it('yearlyMeansByScenario extracts yearly means per scenario', () => {
    const series = yearlyMeansByScenario([baseline, high], 'cpu');
    expect(series).toHaveLength(2);
    expect(series[0].years).toEqual([2026, 2027]);
    expect(series[0].means).toEqual([50, 50]);
    expect(series[1].scenarioName).toBe('High');
  });
});
