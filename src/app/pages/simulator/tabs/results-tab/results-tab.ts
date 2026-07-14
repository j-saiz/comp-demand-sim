import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  chartColorForIndex,
  FanChart,
  FanChartSeries,
} from '../../../../components/fan-chart/fan-chart';
import { HelpTip } from '../../../../components/help-tip/help-tip';
import { MONTH_LABELS } from '../../../../data/mvp-seed';
import { assemblyName } from '../../../../services/scenario-forecast';
import {
  formatInteger,
  formatNumber,
  formatPercent,
} from '../../../../services/statistics';
import { SimStateService } from '../../../../services/sim-state.service';

/** Sentinel value for charting every component together. */
export const CHART_ALL_COMPONENTS = '__all__';

@Component({
  selector: 'app-results-tab',
  imports: [FormsModule, DecimalPipe, FanChart, HelpTip],
  templateUrl: './results-tab.html',
  styleUrl: './results-tab.scss',
})
export class ResultsTab {
  readonly state = inject(SimStateService);

  readonly monthLabels = MONTH_LABELS;
  readonly chartAllId = CHART_ALL_COMPONENTS;

  readonly formatNumber = formatNumber;
  readonly formatPercent = formatPercent;
  readonly formatInteger = formatInteger;

  readonly resultComponents = computed(() => {
    const result = this.state.primaryResult();
    if (!result) return [];
    return result.componentAnnual.map((c) => ({
      id: c.componentId,
      name: c.componentName,
    }));
  });

  readonly comparedScenarioList = computed(() =>
    this.state.comparedResults().map((r) => ({
      id: r.scenarioId,
      name: r.scenarioName,
    })),
  );

  readonly baselineName = computed(() => {
    const id = this.state.baselineScenarioId();
    return (
      this.state.scenarios().find((s) => s.id === id)?.name ??
      this.state.comparedResults().find((r) => r.scenarioId === id)
        ?.scenarioName ??
      'Baseline'
    );
  });

  readonly isAllComponentsChart = computed(
    () => this.state.selectedChartComponentId() === CHART_ALL_COMPONENTS,
  );

  readonly chartSeries = computed((): FanChartSeries[] => {
    const result = this.state.primaryResult();
    if (!result) return [];

    const selected = this.state.selectedChartComponentId();
    const components = this.resultComponents();

    if (selected === CHART_ALL_COMPONENTS) {
      return components.map((c, i) => ({
        id: c.id,
        name: c.name,
        bands: result.monthlyBands[c.id] ?? [],
        color: chartColorForIndex(i),
      }));
    }

    const index = components.findIndex((c) => c.id === selected);
    const name =
      components[index]?.name ??
      this.state.components().find((c) => c.id === selected)?.name ??
      selected;
    const color = chartColorForIndex(index >= 0 ? index : 0);

    return [
      {
        id: selected,
        name,
        bands: result.monthlyBands[selected] ?? [],
        color,
      },
    ];
  });

  /** Cross-scenario mean lines for one component */
  readonly scenarioCompareSeries = computed((): FanChartSeries[] => {
    const componentId = this.state.compareChartComponentId();
    const series = this.state.compareMonthlySeries(componentId);
    return series.map((s, i) => ({
      id: s.scenarioId,
      name: s.scenarioName,
      bands: s.months.map((month, mi) => ({
        month,
        mean: s.means[mi] ?? 0,
        p10: s.means[mi] ?? 0,
        p25: s.means[mi] ?? 0,
        p75: s.means[mi] ?? 0,
        p90: s.means[mi] ?? 0,
      })),
      color: chartColorForIndex(i),
    }));
  });

  readonly compareChartComponentName = computed(() => {
    const id = this.state.compareChartComponentId();
    return (
      this.resultComponents().find((c) => c.id === id)?.name ??
      this.state.components().find((c) => c.id === id)?.name ??
      id
    );
  });

  readonly chartTitle = computed(() => {
    if (this.isAllComponentsChart()) {
      return 'Monthly component demand (all components)';
    }
    const name = this.chartSeries()[0]?.name ?? 'Component';
    return `Monthly ${name} demand`;
  });

  readonly chartComponentName = computed(() => {
    if (this.isAllComponentsChart()) {
      return 'All components';
    }
    return this.chartSeries()[0]?.name ?? 'Component';
  });

  assemblyLabel(assemblyId: string): string {
    return assemblyName(assemblyId, this.state.assemblies());
  }

  onDetailScenarioChange(id: string): void {
    this.state.setDetailScenario(id);
  }

  onChartComponentChange(id: string): void {
    this.state.selectedChartComponentId.set(id);
  }

  onCompareChartComponentChange(id: string): void {
    this.state.compareChartComponentId.set(id);
  }

  exportCsv(): void {
    this.state.exportCsvFile();
  }

  goToRun(): void {
    this.state.selectTab('run');
  }

  monthLabel(month: number): string {
    return this.monthLabels[month - 1] ?? String(month);
  }

  meanFor(row: { means: Record<string, number> }, scenarioId: string): number {
    return row.means[scenarioId] ?? 0;
  }

  p90For(row: { p90s: Record<string, number> }, scenarioId: string): number {
    return row.p90s[scenarioId] ?? 0;
  }
}
