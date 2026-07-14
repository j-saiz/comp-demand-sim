import { Injectable } from '@angular/core';
import {
  Assembly,
  BomMatrix,
  ComponentDef,
  ForecastCell,
  MonthlyAllocationRow,
  ScenarioDemandLine,
  ScenarioResultView,
  SimulationRawResult,
  SimulationSettings,
  UserScenario,
} from '../models/domain';
import { MONTHS } from '../data/mvp-seed';
import { SeededRng } from './rng';
import {
  assemblyName,
  buildForecastFromLines,
  validateDemandLines,
} from './scenario-forecast';
import {
  roundComponentQty,
  sampleBuildQuantity,
  validateDistribution,
} from './sampling';
import { computeStats } from './statistics';

export interface CatalogSnapshot {
  components: ComponentDef[];
  assemblies: Assembly[];
  bom: BomMatrix;
}

@Injectable({ providedIn: 'root' })
export class MonteCarloService {
  readonly months = [...MONTHS];

  validateForecast(cells: ForecastCell[]): string[] {
    const messages: string[] = [];
    for (const cell of cells) {
      const path = `month ${cell.month} / ${cell.assemblyId}`;
      const issues = validateDistribution(cell, path);
      for (const issue of issues) {
        messages.push(`${issue.path}: ${issue.message}`);
      }
    }
    return messages;
  }

  runUserScenario(
    scenario: UserScenario,
    settings: SimulationSettings,
    catalog: CatalogSnapshot,
  ): ScenarioResultView {
    if (catalog.components.length === 0) {
      throw new Error(
        'Add at least one component on the Assumptions tab before running.',
      );
    }
    if (catalog.assemblies.length === 0) {
      throw new Error(
        'Add at least one assembly on the Assumptions tab before running.',
      );
    }

    const lineIssues = validateDemandLines(
      scenario.lines,
      settings.planningYear,
      catalog.assemblies,
    );
    if (lineIssues.length > 0) {
      throw new Error(lineIssues.map((i) => `${i.path}: ${i.message}`).join(' '));
    }

    const forecast = buildForecastFromLines(
      scenario.lines,
      settings.planningYear,
      settings.monthlyUncertaintyPct,
    );

    if (forecast.length === 0) {
      throw new Error(
        'No demand falls inside the planning year. Adjust quantities or date ranges.',
      );
    }

    const issues = this.validateForecast(forecast);
    if (issues.length > 0) {
      throw new Error(`Invalid forecast: ${issues.join('; ')}`);
    }

    const raw = this.simulate(scenario, forecast, catalog, settings);
    return this.toView(raw, scenario, settings, forecast, catalog);
  }

  private simulate(
    scenario: UserScenario,
    forecast: ForecastCell[],
    catalog: CatalogSnapshot,
    settings: SimulationSettings,
  ): SimulationRawResult {
    const iterations = Math.max(1, Math.floor(settings.iterations));
    const months = this.months;
    const componentIds = catalog.components.map((c) => c.id);
    const bom = catalog.bom;

    const demand: Record<string, number[][]> = {};
    const annual: Record<string, number[]> = {};

    for (const cid of componentIds) {
      demand[cid] = months.map(() => new Array<number>(iterations).fill(0));
      annual[cid] = new Array<number>(iterations).fill(0);
    }

    const rng = new SeededRng(settings.seed);

    // Sample each forecast contribution independently (preserves per-line distributions).
    for (let iter = 0; iter < iterations; iter++) {
      for (const cell of forecast) {
        const units = sampleBuildQuantity(cell, rng);
        const mi = cell.month - 1;
        if (mi < 0 || mi >= months.length) continue;

        const recipe = bom[cell.assemblyId] ?? {};
        for (const cid of componentIds) {
          const perUnit = recipe[cid] ?? 0;
          const qty = roundComponentQty(units * perUnit);
          demand[cid][mi][iter] += qty;
          annual[cid][iter] += qty;
        }
      }
    }

    return {
      scenarioId: scenario.id,
      iterations,
      seed: settings.seed,
      months: [...months],
      componentIds,
      demand,
      annual,
    };
  }

  private toView(
    raw: SimulationRawResult,
    scenario: UserScenario,
    settings: SimulationSettings,
    forecast: ForecastCell[],
    catalog: CatalogSnapshot,
  ): ScenarioResultView {
    const nameById = new Map(catalog.components.map((c) => [c.id, c.name]));
    const levels = settings.percentiles;

    const componentAnnual = raw.componentIds.map((componentId) => {
      const stats = computeStats(raw.annual[componentId], levels);
      return {
        componentId,
        componentName: nameById.get(componentId) ?? componentId,
        stats,
      };
    });

    const componentByMonth = raw.componentIds.flatMap((componentId) =>
      raw.months.map((month, mi) => ({
        componentId,
        componentName: nameById.get(componentId) ?? componentId,
        month,
        stats: computeStats(raw.demand[componentId][mi], levels),
      })),
    );

    const cvRanking = [...componentAnnual].sort(
      (a, b) => b.stats.cv - a.stats.cv,
    );

    const monthlyBands: ScenarioResultView['monthlyBands'] = {};
    for (const componentId of raw.componentIds) {
      monthlyBands[componentId] = raw.months.map((month, mi) => {
        const stats = computeStats(raw.demand[componentId][mi], [
          10, 25, 50, 75, 90,
        ]);
        return {
          month,
          mean: stats.mean,
          p10: stats.percentiles['p10'] ?? stats.min,
          p25: stats.percentiles['p25'] ?? stats.min,
          p75: stats.percentiles['p75'] ?? stats.max,
          p90: stats.percentiles['p90'] ?? stats.max,
        };
      });
    }

    const monthlyAllocation: MonthlyAllocationRow[] = forecast.map((cell) => ({
      month: cell.month,
      year: cell.year,
      assemblyId: cell.assemblyId,
      assemblyName: assemblyName(cell.assemblyId, catalog.assemblies),
      expectedUnits: cell.expected,
      minUnits: cell.min,
      maxUnits: cell.max,
      distribution: cell.distribution,
    }));

    const lines: ScenarioDemandLine[] = scenario.lines.map((l) => ({ ...l }));

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      iterations: raw.iterations,
      seed: raw.seed,
      months: raw.months,
      planningYear: settings.planningYear,
      lines,
      monthlyAllocation,
      componentAnnual,
      componentByMonth,
      cvRanking,
      monthlyBands,
    };
  }
}
