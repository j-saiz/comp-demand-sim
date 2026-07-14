/** Catalog item consumed by assemblies (e.g. CPU, RAM, chassis). */
export interface ComponentDef {
  id: string;
  name: string;
  unit: string;
}

/**
 * Finished good / configuration that is demanded independently and
 * explodes into component requirements via the BOM.
 */
export interface Assembly {
  id: string;
  name: string;
  description: string;
}

/** Units of each component required per one unit of an assembly. */
export type BomMatrix = Record<string, Record<string, number>>;

export type DistributionType = 'fixed' | 'uniform' | 'triangular';

/**
 * User-defined demand line inside a scenario:
 * an assembly, total quantity, date window, and sampling distribution.
 */
export interface ScenarioDemandLine {
  id: string;
  assemblyId: string;
  /** Total number of assembly units in the date window. */
  quantity: number;
  /** Inclusive start date (YYYY-MM-DD). */
  startDate: string;
  /** Inclusive end date (YYYY-MM-DD). */
  endDate: string;
  /**
   * How monthly allocated quantities are sampled:
   * fixed = exact allocation; uniform/triangular = band around allocation.
   */
  distribution: DistributionType;
}

/** Editable scenario composed of one or more demand lines. */
export interface UserScenario {
  id: string;
  name: string;
  lines: ScenarioDemandLine[];
}

/**
 * Forecast cell: monthly assembly-quantity uncertainty for one assembly.
 * Validation rules:
 * - min >= 0, max >= min
 * - fixed: expected used as exact value
 * - uniform: sample in [min, max]
 * - triangular: min <= mode(expected) <= max
 */
export interface ForecastCell {
  month: number; // 1-12 within planning year
  year: number;
  assemblyId: string;
  expected: number;
  min: number;
  max: number;
  distribution: DistributionType;
}

export interface SimulationSettings {
  iterations: number;
  seed: number;
  percentiles: number[];
  /**
   * Relative uncertainty band around the allocated monthly assembly count
   * when a line uses uniform or triangular sampling (e.g. 0.15 ≈ ±15%).
   * Ignored for fixed distribution.
   */
  monthlyUncertaintyPct: number;
  /** Planning calendar year used to bin demand dates into months. */
  planningYear: number;
}

export interface DistributionSampleInput {
  distribution: DistributionType;
  expected: number;
  min: number;
  max: number;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Raw Monte Carlo output for one scenario. */
export interface SimulationRawResult {
  scenarioId: string;
  iterations: number;
  seed: number;
  months: number[];
  componentIds: string[];
  /**
   * demand[componentId][monthIndex0][iteration] = integer component units
   */
  demand: Record<string, number[][]>;
  /** Annual totals per component per iteration */
  annual: Record<string, number[]>;
}

export interface StatSummary {
  mean: number;
  stdDev: number;
  cv: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
}

export interface ComponentMonthStats {
  componentId: string;
  componentName: string;
  month: number;
  stats: StatSummary;
}

export interface ComponentAnnualStats {
  componentId: string;
  componentName: string;
  stats: StatSummary;
}

export interface MonthlyAllocationRow {
  month: number;
  year: number;
  assemblyId: string;
  assemblyName: string;
  expectedUnits: number;
  minUnits: number;
  maxUnits: number;
  distribution: DistributionType;
}

export interface ScenarioResultView {
  scenarioId: string;
  scenarioName: string;
  iterations: number;
  seed: number;
  months: number[];
  planningYear: number;
  lines: ScenarioDemandLine[];
  monthlyAllocation: MonthlyAllocationRow[];
  componentAnnual: ComponentAnnualStats[];
  componentByMonth: ComponentMonthStats[];
  cvRanking: ComponentAnnualStats[];
  /** For fan chart: series per component */
  monthlyBands: Record<
    string,
    {
      month: number;
      mean: number;
      p10: number;
      p25: number;
      p75: number;
      p90: number;
    }[]
  >;
}

/** @deprecated Use ScenarioDemandLine */
export type ScenarioBuildLine = ScenarioDemandLine;
