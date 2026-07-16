import { Injectable } from '@angular/core';
import { ScenarioResultView } from '../models/domain';

@Injectable({ providedIn: 'root' })
export class ExportCsvService {
  exportResults(results: ScenarioResultView[]): void {
    const sections: string[] = [];

    for (const result of results) {
      sections.push(`# Scenario: ${result.scenarioName}`);
      sections.push(
        `# Iterations: ${result.iterations}; Seed: ${result.seed}; Planning start: ${result.planningStartYear}; Horizon years: ${result.planningHorizonYears}`,
      );
      sections.push('');
      sections.push('## Demand lines');
      sections.push('Assembly,Quantity,Start Year,End Year,Distribution');
      for (const line of result.lines) {
        sections.push(
          [
            csvEscape(line.assemblyId),
            String(line.quantity),
            String(line.startYear),
            String(line.endYear),
            line.distribution ?? 'triangular',
          ].join(','),
        );
      }

      sections.push('');
      sections.push('## Yearly allocation (expected assembly units)');
      sections.push('Year,Assembly,Expected,Min,Max,Distribution');
      for (const row of result.yearlyAllocation) {
        sections.push(
          [
            String(row.year),
            csvEscape(row.assemblyName),
            fmt(row.expectedUnits, 0),
            fmt(row.minUnits, 0),
            fmt(row.maxUnits, 0),
            row.distribution,
          ].join(','),
        );
      }

      sections.push('');
      sections.push('## Component Horizon Summary');
      sections.push(
        [
          'Component',
          'Mean',
          'StdDev',
          'CV',
          'Min',
          'Max',
          'P50',
          'P80',
          'P90',
          'P95',
        ].join(','),
      );

      for (const row of result.componentHorizon) {
        const p = row.stats.percentiles;
        sections.push(
          [
            csvEscape(row.componentName),
            fmt(row.stats.mean),
            fmt(row.stats.stdDev),
            fmt(row.stats.cv, 4),
            fmt(row.stats.min),
            fmt(row.stats.max),
            fmt(p['p50']),
            fmt(p['p80']),
            fmt(p['p90']),
            fmt(p['p95']),
          ].join(','),
        );
      }

      sections.push('');
      sections.push('## Component by Year');
      sections.push(
        [
          'Component',
          'Year',
          'Mean',
          'StdDev',
          'CV',
          'P50',
          'P80',
          'P90',
          'P95',
        ].join(','),
      );

      for (const row of result.componentByYear) {
        const p = row.stats.percentiles;
        sections.push(
          [
            csvEscape(row.componentName),
            String(row.year),
            fmt(row.stats.mean),
            fmt(row.stats.stdDev),
            fmt(row.stats.cv, 4),
            fmt(p['p50']),
            fmt(p['p80']),
            fmt(p['p90']),
            fmt(p['p95']),
          ].join(','),
        );
      }

      sections.push('');
    }

    const blob = new Blob([sections.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comp-demand-sim-results-${dateStamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(digits);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
