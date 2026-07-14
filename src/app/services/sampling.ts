import { DistributionSampleInput, ValidationIssue } from '../models/domain';
import { SeededRng } from './rng';

/** Validate distribution parameters for logical/mathematical consistency. */
export function validateDistribution(
  input: DistributionSampleInput,
  path = 'forecast',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { distribution, expected, min, max } = input;

  if (!Number.isFinite(expected) || !Number.isFinite(min) || !Number.isFinite(max)) {
    issues.push({ path, message: 'Expected, min, and max must be finite numbers.' });
    return issues;
  }

  if (min < 0) {
    issues.push({ path, message: 'Minimum quantity must be nonnegative.' });
  }

  if (max < min) {
    issues.push({ path, message: 'Maximum must be greater than or equal to minimum.' });
  }

  if (distribution === 'fixed') {
    if (expected < 0) {
      issues.push({ path, message: 'Fixed expected quantity must be nonnegative.' });
    }
  }

  if (distribution === 'triangular') {
    if (expected < min || expected > max) {
      issues.push({
        path,
        message: 'Triangular mode (expected) must lie between min and max.',
      });
    }
  }

  return issues;
}

/**
 * Sample a continuous value from the distribution, then round to a
 * nonnegative integer assembly quantity.
 */
export function sampleBuildQuantity(
  input: DistributionSampleInput,
  rng: SeededRng,
): number {
  const continuous = sampleContinuous(input, rng);
  return Math.max(0, Math.round(continuous));
}

/** @deprecated Alias — samples assembly unit quantities. */
export const sampleAssemblyQuantity = sampleBuildQuantity;

function sampleContinuous(
  input: DistributionSampleInput,
  rng: SeededRng,
): number {
  const { distribution, expected, min, max } = input;

  switch (distribution) {
    case 'fixed':
      return expected;
    case 'uniform':
      return sampleUniform(min, max, rng);
    case 'triangular':
      return sampleTriangular(min, expected, max, rng);
    default: {
      const _exhaustive: never = distribution;
      return _exhaustive;
    }
  }
}

function sampleUniform(min: number, max: number, rng: SeededRng): number {
  if (max <= min) {
    return min;
  }
  return min + rng.next() * (max - min);
}

/** Inverse CDF sampling for triangular distribution. */
function sampleTriangular(
  min: number,
  mode: number,
  max: number,
  rng: SeededRng,
): number {
  if (max <= min) {
    return min;
  }

  const clampedMode = Math.min(max, Math.max(min, mode));
  const u = rng.next();
  const total = max - min;
  const left = clampedMode - min;
  const fc = left / total;

  if (u < fc) {
    return min + Math.sqrt(u * total * left);
  }
  return max - Math.sqrt((1 - u) * total * (max - clampedMode));
}

/** Round component requirements to nonnegative integers. */
export function roundComponentQty(value: number): number {
  return Math.max(0, Math.round(value));
}
