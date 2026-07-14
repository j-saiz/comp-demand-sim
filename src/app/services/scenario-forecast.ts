import {
  Assembly,
  DistributionType,
  ForecastCell,
  ScenarioDemandLine,
  ValidationIssue,
} from '../models/domain';
import { MONTHS } from '../data/mvp-seed';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function validateDemandLines(
  lines: ScenarioDemandLine[],
  planningYear: number,
  assemblies: Assembly[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validAssemblyIds = new Set(assemblies.map((a) => a.id));

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

    const start = parseIsoDate(line.startDate);
    const end = parseIsoDate(line.endDate);

    if (!start) {
      issues.push({ path, message: 'Start date must be a valid date.' });
    }
    if (!end) {
      issues.push({ path, message: 'End date must be a valid date.' });
    }
    if (start && end && end < start) {
      issues.push({ path, message: 'End date must be on or after start date.' });
    }

    if (start && end) {
      const overlapsYear =
        start.getFullYear() <= planningYear && end.getFullYear() >= planningYear;
      if (!overlapsYear) {
        issues.push({
          path,
          message: `Date range does not overlap planning year ${planningYear}.`,
        });
      }
    }
  });

  return issues;
}

/**
 * Allocate integer unit counts across months using day-weighted shares
 * and largest-remainder rounding so monthly totals sum to `quantity`.
 */
export function allocateQuantityByMonth(
  quantity: number,
  startDate: string,
  endDate: string,
  planningYear: number,
): Map<number, number> {
  const result = new Map<number, number>();
  for (const month of MONTHS) {
    result.set(month, 0);
  }

  if (quantity <= 0) {
    return result;
  }

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) {
    return result;
  }

  const weights = new Map<number, number>();
  let totalWeight = 0;

  for (const month of MONTHS) {
    const days = overlapDaysInMonth(start, end, planningYear, month);
    weights.set(month, days);
    totalWeight += days;
  }

  if (totalWeight <= 0) {
    return result;
  }

  const exact = new Map<number, number>();
  const floors = new Map<number, number>();
  let assigned = 0;

  for (const month of MONTHS) {
    const share = (quantity * (weights.get(month) ?? 0)) / totalWeight;
    exact.set(month, share);
    const floored = Math.floor(share);
    floors.set(month, floored);
    assigned += floored;
  }

  let remaining = quantity - assigned;
  const order = [...MONTHS].sort((a, b) => {
    const fa = (exact.get(a) ?? 0) - (floors.get(a) ?? 0);
    const fb = (exact.get(b) ?? 0) - (floors.get(b) ?? 0);
    return fb - fa;
  });

  for (const month of order) {
    if (remaining <= 0) break;
    if ((weights.get(month) ?? 0) <= 0) continue;
    floors.set(month, (floors.get(month) ?? 0) + 1);
    remaining -= 1;
  }

  for (const month of MONTHS) {
    result.set(month, floors.get(month) ?? 0);
  }

  return result;
}

function overlapDaysInMonth(
  rangeStart: Date,
  rangeEnd: Date,
  year: number,
  month: number,
): number {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const start = rangeStart > monthStart ? rangeStart : monthStart;
  const end = rangeEnd < monthEnd ? rangeEnd : monthEnd;

  if (end < start) return 0;

  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Convert scenario demand lines into monthly forecast cells for Monte Carlo.
 * Each line keeps its own distribution; multiple lines in the same month/assembly
 * become separate cells that are sampled independently and summed.
 */
export function buildForecastFromLines(
  lines: ScenarioDemandLine[],
  planningYear: number,
  monthlyUncertaintyPct: number,
): ForecastCell[] {
  const spread = Math.max(0, monthlyUncertaintyPct);
  const cells: ForecastCell[] = [];

  for (const line of lines) {
    const distribution = normalizeDistribution(line.distribution);
    const monthly = allocateQuantityByMonth(
      Math.max(0, Math.round(line.quantity)),
      line.startDate,
      line.endDate,
      planningYear,
    );

    for (const [month, expected] of monthly) {
      if (expected <= 0) continue;
      const { min, max, distribution: effectiveDist } = bandAroundExpected(
        expected,
        spread,
        distribution,
      );

      cells.push({
        month,
        year: planningYear,
        assemblyId: line.assemblyId,
        expected,
        min,
        max,
        distribution: effectiveDist,
      });
    }
  }

  cells.sort(
    (a, b) => a.month - b.month || a.assemblyId.localeCompare(b.assemblyId),
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
 * Build min/max sampling band around the day-weighted monthly allocation.
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
      'Use the allocated monthly quantity exactly (no sampling noise).',
  },
  {
    value: 'uniform',
    label: 'Uniform',
    description: 'Sample evenly between the uncertainty min and max each month.',
  },
  {
    value: 'triangular',
    label: 'Triangular',
    description:
      'Peak at the allocated quantity (mode), tapering to the uncertainty min/max.',
  },
];
