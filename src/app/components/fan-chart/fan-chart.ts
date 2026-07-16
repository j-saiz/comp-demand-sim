import {
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import * as Highcharts from 'highcharts';
import 'highcharts/highcharts-more';

export interface FanBandPoint {
  /** Calendar year (or legacy period index). */
  year?: number;
  /** @deprecated Prefer year */
  month?: number;
  mean: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface FanChartSeries {
  id: string;
  name: string;
  bands: FanBandPoint[];
  /** Stable color shared between all-components and single-component views. */
  color?: string;
}

/** Palette used for component series (order matches result component list). */
export const CHART_SERIES_COLORS = [
  '#2457d6',
  '#0f7b6c',
  '#c47b16',
  '#9b2c6b',
  '#5b4bb7',
  '#b42318',
  '#1f6b3a',
  '#0b6e99',
] as const;

export function chartColorForIndex(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function periodLabel(point: FanBandPoint): string {
  if (point.year != null) return String(point.year);
  if (point.month != null) return String(point.month);
  return '';
}

@Component({
  selector: 'app-fan-chart',
  templateUrl: './fan-chart.html',
  styleUrl: './fan-chart.scss',
})
export class FanChart implements OnDestroy {
  readonly title = input('Yearly demand uncertainty');
  /** Used for single-series fan subtitle / a11y. */
  readonly componentName = input('Component');
  /** Single-series fan bands (legacy / simple). Prefer `series` for multi. */
  readonly bands = input<FanBandPoint[]>([]);
  /** One or more component series. When length > 1, plots mean lines only. */
  readonly series = input<FanChartSeries[]>([]);
  readonly height = input(480);
  readonly xAxisTitle = input('Year');

  private readonly chartEl = viewChild<ElementRef<HTMLElement>>('chart');
  private chart?: Highcharts.Chart;

  constructor() {
    effect(() => {
      const series = this.resolveSeries();
      const title = this.title();
      const componentName = this.componentName();
      const height = this.height();
      const xAxisTitle = this.xAxisTitle();
      queueMicrotask(() =>
        this.render(series, title, componentName, height, xAxisTitle),
      );
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = undefined;
  }

  private resolveSeries(): FanChartSeries[] {
    const multi = this.series();
    if (multi.length > 0) {
      return multi;
    }
    const bands = this.bands();
    if (bands.length === 0) {
      return [];
    }
    return [
      {
        id: 'single',
        name: this.componentName(),
        bands,
        color: chartColorForIndex(0),
      },
    ];
  }

  private render(
    seriesList: FanChartSeries[],
    title: string,
    componentName: string,
    height: number,
    xAxisTitle: string,
  ): void {
    const el = this.chartEl()?.nativeElement;
    if (!el) return;

    const nonEmpty = seriesList.filter((s) => s.bands.length > 0);
    if (nonEmpty.length === 0) {
      this.chart?.destroy();
      this.chart = undefined;
      el.innerHTML =
        '<p class="fan-chart__empty">Run a simulation to plot yearly demand.</p>';
      return;
    }

    const categories = nonEmpty[0].bands.map((b) => periodLabel(b));

    const multi = nonEmpty.length > 1;
    const chartSeries: Highcharts.SeriesOptionsType[] = multi
      ? this.buildMultiMeanSeries(nonEmpty)
      : this.buildSingleFanSeries(nonEmpty[0]);

    const subtitle = multi
      ? 'Mean yearly demand by series (select one component for P10–P90 fan bands)'
      : `${componentName} — mean with P10/P90 and P25/P75 bands`;

    const options: Highcharts.Options = {
      chart: {
        type: multi ? 'spline' : 'areasplinerange',
        backgroundColor: 'transparent',
        height,
        style: { fontFamily: 'inherit' },
      },
      title: {
        text: title,
        align: 'left',
        style: { fontSize: '1rem', fontWeight: '600' },
      },
      subtitle: {
        text: subtitle,
        align: 'left',
        style: { fontSize: '0.8rem' },
      },
      xAxis: {
        categories: [...categories],
        title: { text: xAxisTitle },
      },
      yAxis: {
        title: { text: 'Units' },
        min: 0,
      },
      tooltip: {
        shared: true,
        valueDecimals: 1,
      },
      legend: {
        enabled: true,
      },
      credits: { enabled: false },
      series: chartSeries,
      accessibility: {
        description: multi
          ? `Time series of mean yearly demand for ${nonEmpty.length} series.`
          : `Fan chart of yearly ${componentName} demand showing mean and percentile bands.`,
      },
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = Highcharts.chart(el, options);
  }

  private seriesColor(series: FanChartSeries, fallbackIndex: number): string {
    return series.color ?? chartColorForIndex(fallbackIndex);
  }

  private buildSingleFanSeries(
    series: FanChartSeries,
  ): Highcharts.SeriesOptionsType[] {
    const bands = series.bands;
    const p10p90 = bands.map((b) => [b.p10, b.p90] as [number, number]);
    const p25p75 = bands.map((b) => [b.p25, b.p75] as [number, number]);
    const means = bands.map((b) => b.mean);
    const color = this.seriesColor(series, 0);

    return [
      {
        type: 'areasplinerange',
        name: 'P10–P90',
        data: p10p90,
        color: hexToRgba(color, 0.18),
        lineWidth: 0,
        marker: { enabled: false },
        zIndex: 0,
      },
      {
        type: 'areasplinerange',
        name: 'P25–P75',
        data: p25p75,
        color: hexToRgba(color, 0.32),
        lineWidth: 0,
        marker: { enabled: false },
        zIndex: 1,
      },
      {
        type: 'spline',
        name: 'Mean',
        data: means,
        color,
        lineWidth: 2.5,
        zIndex: 2,
        marker: { radius: 3 },
      },
    ];
  }

  private buildMultiMeanSeries(
    seriesList: FanChartSeries[],
  ): Highcharts.SeriesOptionsType[] {
    return seriesList.map((s, i) => ({
      type: 'spline' as const,
      name: s.name,
      data: s.bands.map((b) => b.mean),
      color: this.seriesColor(s, i),
      lineWidth: 2.25,
      marker: { radius: 3 },
      zIndex: 2,
    }));
  }
}
