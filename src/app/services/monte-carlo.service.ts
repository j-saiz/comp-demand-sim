import { Injectable } from '@angular/core';
import {
  Assembly,
  BomMatrix,
  ComponentDef,
  ForecastCell,
  ScenarioDemandLine,
  ScenarioResultView,
  SimulationRawResult,
  SimulationSettings,
  UserScenario,
  YearlyAllocationRow,
} from '../models/domain';
import { planningYears } from '../data/mvp-seed';
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
  validateForecast(cells: ForecastCell[]): string[] {
    const messages: string[] = [];
    for (const cell of cells) {
      const path = `year ${cell.year} / ${cell.assemblyId}`;
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
      settings.planningStartYear,
      settings.planningHorizonYears,
      catalog.assemblies,
    );
    if (lineIssues.length > 0) {
      throw new Error(lineIssues.map((i) => `${i.path}: ${i.message}`).join(' '));
    }

    const forecast = buildForecastFromLines(
      scenario.lines,
      settings.planningStartYear,
      settings.planningHorizonYears,
      settings.yearlyUncertaintyPct,
    );

    if (forecast.length === 0) {
      throw new Error(
        'No demand falls inside the planning horizon. Adjust quantities or year ranges.',
      );
    }

    const issues = this.validateForecast(forecast);
    if (issues.length > 0) {
      throw new Error(`Invalid forecast: ${issues.join('; ')}`);
    }

    const years = planningYears(
      settings.planningStartYear,
      settings.planningHorizonYears,
    );
    const raw = this.simulate(scenario, forecast, catalog, settings, years);
    return this.toView(raw, scenario, settings, forecast, catalog);
  }

  private simulate(
    scenario: UserScenario,
    forecast: ForecastCell[],
    catalog: CatalogSnapshot,
    settings: SimulationSettings,
    years: number[],
  ): SimulationRawResult {
    const iterations = Math.max(1, Math.floor(settings.iterations));
    const componentIds = catalog.components.map((c) => c.id);
    const bom = catalog.bom;
    const yearIndex = new Map(years.map((y, i) => [y, i]));

    const demand: Record<string, number[][]> = {};
    const annual: Record<string, number[]> = {};

    for (const cid of componentIds) {
      demand[cid] = years.map(() => new Array<number>(iterations).fill(0));
      annual[cid] = new Array<number>(iterations).fill(0);
    }

    const rng = new SeededRng(settings.seed);

    for (let iter = 0; iter < iterations; iter++) {
      for (const cell of forecast) {
        const units = sampleBuildQuantity(cell, rng);
        const yi = yearIndex.get(cell.year);
        if (yi === undefined) continue;

        const recipe = bom[cell.assemblyId] ?? {};
        for (const cid of componentIds) {
          const perUnit = recipe[cid] ?? 0;
          const qty = roundComponentQty(units * perUnit);
          demand[cid][yi][iter] += qty;
          annual[cid][iter] += qty;
        }
      }
    }

    return {
      scenarioId: scenario.id,
      iterations,
      seed: settings.seed,
      years: [...years],
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

    const componentHorizon = raw.componentIds.map((componentId) => {
      const stats = computeStats(raw.annual[componentId], levels);
      return {
        componentId,
        componentName: nameById.get(componentId) ?? componentId,
        stats,
      };
    });

    const componentByYear = raw.componentIds.flatMap((componentId) =>
      raw.years.map((year, yi) => ({
        componentId,
        componentName: nameById.get(componentId) ?? componentId,
        year,
        stats: computeStats(raw.demand[componentId][yi], levels),
      })),
    );

    const cvRanking = [...componentHorizon].sort(
      (a, b) => b.stats.cv - a.stats.cv,
    );

    const yearlyBands: ScenarioResultView['yearlyBands'] = {};
    for (const componentId of raw.componentIds) {
      yearlyBands[componentId] = raw.years.map((year, yi) => {
        const stats = computeStats(raw.demand[componentId][yi], [
          10, 25, 50, 75, 90,
        ]);
        return {
          year,
          mean: stats.mean,
          p10: stats.percentiles['p10'] ?? stats.min,
          p25: stats.percentiles['p25'] ?? stats.min,
          p75: stats.percentiles['p75'] ?? stats.max,
          p90: stats.percentiles['p90'] ?? stats.max,
        };
      });
    }

    const yearlyAllocation: YearlyAllocationRow[] = forecast.map((cell) => ({
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
      years: raw.years,
      planningStartYear: settings.planningStartYear,
      planningHorizonYears: settings.planningHorizonYears,
      lines,
      yearlyAllocation,
      componentHorizon,
      componentByYear,
      cvRanking,
      yearlyBands,
    };
  }
}
