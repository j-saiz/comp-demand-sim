import { ScenarioResultView } from '../models/domain';

export interface ComponentDeltaRow {
  componentId: string;
  componentName: string;
  /** Mean horizon demand by scenario id */
  means: Record<string, number>;
  /** P90 horizon demand by scenario id */
  p90s: Record<string, number>;
  baselineMean: number;
  baselineP90: number;
  maxMean: number;
  minMean: number;
  maxP90: number;
  minP90: number;
  deltaMean: number;
  deltaP90: number;
  deltaMeanPct: number;
  deltaP90Pct: number;
}

export interface ScenarioCompareMeta {
  scenarioId: string;
  scenarioName: string;
  totalAssemblyUnits: number;
  lineCount: number;
}

/**
 * Build horizon-total component comparison rows across scenario results.
 * @param baselineId Scenario used as the reference for Δ columns.
 */
export function buildAnnualDeltas(
  results: ScenarioResultView[],
  baselineId?: string,
): ComponentDeltaRow[] {
  if (results.length === 0) return [];

  const baseline =
    results.find((r) => r.scenarioId === baselineId) ?? results[0];

  const componentIds = new Set<string>();
  for (const r of results) {
    for (const row of r.componentHorizon) {
      componentIds.add(row.componentId);
    }
  }

  const rows: ComponentDeltaRow[] = [];

  for (const componentId of componentIds) {
    const means: Record<string, number> = {};
    const p90s: Record<string, number> = {};
    let componentName = componentId;

    for (const result of results) {
      const annual = result.componentHorizon.find(
        (c) => c.componentId === componentId,
      );
      const mean = annual?.stats.mean ?? 0;
      const p90 = annual?.stats.percentiles['p90'] ?? 0;
      means[result.scenarioId] = mean;
      p90s[result.scenarioId] = p90;
      if (annual) componentName = annual.componentName;
    }

    const meanValues = Object.values(means);
    const p90Values = Object.values(p90s);
    const baselineMean = means[baseline.scenarioId] ?? 0;
    const baselineP90 = p90s[baseline.scenarioId] ?? 0;
    const maxMean = Math.max(...meanValues);
    const minMean = Math.min(...meanValues);
    const maxP90 = Math.max(...p90Values);
    const minP90 = Math.min(...p90Values);
    const deltaMean = maxMean - baselineMean;
    const deltaP90 = maxP90 - baselineP90;

    rows.push({
      componentId,
      componentName,
      means,
      p90s,
      baselineMean,
      baselineP90,
      maxMean,
      minMean,
      maxP90,
      minP90,
      deltaMean,
      deltaP90,
      deltaMeanPct: baselineMean === 0 ? 0 : deltaMean / baselineMean,
      deltaP90Pct: baselineP90 === 0 ? 0 : deltaP90 / baselineP90,
    });
  }

  return rows;
}

/** Rank by absolute P90 swing vs baseline (planning-level sensitivity). */
export function rankByDeltaP90(rows: ComponentDeltaRow[]): ComponentDeltaRow[] {
  return [...rows].sort((a, b) => Math.abs(b.deltaP90) - Math.abs(a.deltaP90));
}

/** Rank by absolute mean swing vs baseline. */
export function rankByDeltaMean(rows: ComponentDeltaRow[]): ComponentDeltaRow[] {
  return [...rows].sort((a, b) => Math.abs(b.deltaMean) - Math.abs(a.deltaMean));
}

export function summarizeScenarios(
  results: ScenarioResultView[],
): ScenarioCompareMeta[] {
  return results.map((r) => ({
    scenarioId: r.scenarioId,
    scenarioName: r.scenarioName,
    totalAssemblyUnits: r.lines.reduce((sum, l) => sum + l.quantity, 0),
    lineCount: r.lines.length,
  }));
}

/**
 * Yearly mean series for one component across scenarios (for multi-line chart).
 */
export function yearlyMeansByScenario(
  results: ScenarioResultView[],
  componentId: string,
): {
  scenarioId: string;
  scenarioName: string;
  years: number[];
  means: number[];
}[] {
  return results.map((r) => {
    const years = r.years;
    const means = years.map((year) => {
      const cell = r.componentByYear.find(
        (c) => c.componentId === componentId && c.year === year,
      );
      return cell?.stats.mean ?? 0;
    });
    return {
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      years: [...years],
      means,
    };
  });
}

/** @deprecated Use yearlyMeansByScenario */
export const monthlyMeansByScenario = yearlyMeansByScenario;
