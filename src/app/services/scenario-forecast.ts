import {
  Assembly,
  DistributionType,
  ForecastCell,
  ScenarioDemandLine,
  ValidationIssue,
} from '../models/domain';
import { planningYears } from '../data/mvp-seed';

export function validateDemandLines(
  lines: ScenarioDemandLine[],
  planningStartYear: number,
  planningHorizonYears: number,
  assemblies: Assembly[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validAssemblyIds = new Set(assemblies.map((a) => a.id));
  const years = planningYears(planningStartYear, planningHorizonYears);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  if (assemblies.length === 0) {
    issues.push({
      path: 'catalog',
      message: 'Define at least one assembly on the Assumptions tab.',
    });
  }

  if (lines.length === 0) {
    issues.push({
      path: 'lines',
      message: 'Add at least one demand line to the scenario.',
    });
    return issues;
  }

  lines.forEach((line, index) => {
    const path = `Line ${index + 1}`;

    if (!validAssemblyIds.has(line.assemblyId)) {
      issues.push({
        path,
        message: 'Select a valid assembly from the Assumptions catalog.',
      });
    }

    if (!Number.isFinite(line.quantity) || line.quantity < 0) {
      issues.push({ path, message: 'Quantity must be a nonnegative number.' });
    } else if (!Number.isInteger(line.quantity)) {
      issues.push({ path, message: 'Quantity must be a whole number.' });
    }

    if (!Number.isInteger(line.startYear) || !Number.isInteger(line.endYear)) {
      issues.push({ path, message: 'Start and end years must be whole numbers.' });
    }

    if (line.endYear < line.startYear) {
      issues.push({
        path,
        message: 'End year must be on or after start year.',
      });
    }

    const overlaps =
      line.startYear <= lastYear && line.endYear >= firstYear;
    if (!overlaps) {
      issues.push({
        path,
        message: `Year range does not overlap the planning horizon (${firstYear}–${lastYear}).`,
      });
    }
  });

  return issues;
}

/**
 * Allocate integer unit counts across planning-horizon years using equal
 * weight per overlapping year and largest-remainder rounding so yearly
 * totals sum to `quantity`.
 */
export function allocateQuantityByYear(
  quantity: number,
  startYear: number,
  endYear: number,
  horizonYears: number[],
): Map<number, number> {
  const result = new Map<number, number>();
  for (const y of horizonYears) {
    result.set(y, 0);
  }

  if (quantity <= 0 || endYear < startYear || horizonYears.length === 0) {
    return result;
  }

  const weights = new Map<number, number>();
  let totalWeight = 0;

  for (const y of horizonYears) {
    const inRange = y >= startYear && y <= endYear ? 1 : 0;
    weights.set(y, inRange);
    totalWeight += inRange;
  }

  if (totalWeight <= 0) {
    return result;
  }

  const exact = new Map<number, number>();
  const floors = new Map<number, number>();
  let assigned = 0;

  for (const y of horizonYears) {
    const share = (quantity * (weights.get(y) ?? 0)) / totalWeight;
    exact.set(y, share);
    const floored = Math.floor(share);
    floors.set(y, floored);
    assigned += floored;
  }

  let remaining = quantity - assigned;
  const order = [...horizonYears].sort((a, b) => {
    const fa = (exact.get(a) ?? 0) - (floors.get(a) ?? 0);
    const fb = (exact.get(b) ?? 0) - (floors.get(b) ?? 0);
    return fb - fa;
  });

  for (const y of order) {
    if (remaining <= 0) break;
    if ((weights.get(y) ?? 0) <= 0) continue;
    floors.set(y, (floors.get(y) ?? 0) + 1);
    remaining -= 1;
  }

  for (const y of horizonYears) {
    result.set(y, floors.get(y) ?? 0);
  }

  return result;
}

/**
 * Convert scenario demand lines into yearly forecast cells for Monte Carlo.
 * Each line keeps its own distribution; multiple lines in the same year/assembly
 * become separate cells that are sampled independently and summed.
 */
export function buildForecastFromLines(
  lines: ScenarioDemandLine[],
  planningStartYear: number,
  planningHorizonYears: number,
  yearlyUncertaintyPct: number,
): ForecastCell[] {
  const horizon = planningYears(planningStartYear, planningHorizonYears);
  const spread = Math.max(0, yearlyUncertaintyPct);
  const cells: ForecastCell[] = [];

  for (const line of lines) {
    const distribution = normalizeDistribution(line.distribution);
    const yearly = allocateQuantityByYear(
      Math.max(0, Math.round(line.quantity)),
      line.startYear,
      line.endYear,
      horizon,
    );

    for (const [year, expected] of yearly) {
      if (expected <= 0) continue;
      const { min, max, distribution: effectiveDist } = bandAroundExpected(
        expected,
        spread,
        distribution,
      );

      cells.push({
        year,
        assemblyId: line.assemblyId,
        expected,
        min,
        max,
        distribution: effectiveDist,
      });
    }
  }

  cells.sort(
    (a, b) => a.year - b.year || a.assemblyId.localeCompare(b.assemblyId),
  );
  return cells;
}

export function normalizeDistribution(
  value: string | DistributionType | undefined,
): DistributionType {
  if (value === 'fixed' || value === 'uniform' || value === 'triangular') {
    return value;
  }
  return 'triangular';
}

/**
 * Build min/max sampling band around the equal-weight yearly allocation.
 * Fixed always uses the exact expected count. Uniform/triangular use the
 * uncertainty percentage (falls back to fixed if the band collapses).
 */
function bandAroundExpected(
  expected: number,
  spread: number,
  requested: DistributionType,
): { min: number; max: number; distribution: DistributionType } {
  if (requested === 'fixed' || spread <= 0 || expected === 0) {
    return { min: expected, max: expected, distribution: 'fixed' };
  }

  const min = Math.max(0, Math.floor(expected * (1 - spread)));
  const max = Math.max(min, Math.ceil(expected * (1 + spread)));

  if (min === max) {
    return { min, max, distribution: 'fixed' };
  }

  return {
    min,
    max,
    distribution: requested,
  };
}

export function assemblyName(
  assemblyId: string,
  assemblies: Assembly[],
): string {
  return assemblies.find((a) => a.id === assemblyId)?.name ?? assemblyId;
}

export const DISTRIBUTION_OPTIONS: {
  value: DistributionType;
  label: string;
  description: string;
}[] = [
  {
    value: 'fixed',
    label: 'Fixed',
    description:
      'Use the allocated yearly quantity exactly (no sampling noise).',
  },
  {
    value: 'uniform',
    label: 'Uniform',
    description: 'Sample evenly between the uncertainty min and max each year.',
  },
  {
    value: 'triangular',
    label: 'Triangular',
    description:
      'Peak at the allocated quantity (mode), tapering to the uncertainty min/max.',
  },
];
