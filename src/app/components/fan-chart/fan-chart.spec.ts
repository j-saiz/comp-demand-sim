import {
  chartColorForIndex,
  CHART_SERIES_COLORS,
} from './fan-chart';

describe('chartColorForIndex', () => {
  it('returns the first palette color for index 0', () => {
    expect(chartColorForIndex(0)).toBe(CHART_SERIES_COLORS[0]);
  });

  it('wraps indices with modulo palette length', () => {
    const n = CHART_SERIES_COLORS.length;
    expect(chartColorForIndex(n)).toBe(CHART_SERIES_COLORS[0]);
    expect(chartColorForIndex(n + 1)).toBe(CHART_SERIES_COLORS[1]);
  });

  it('is stable for the same index', () => {
    expect(chartColorForIndex(3)).toBe(chartColorForIndex(3));
  });
});
