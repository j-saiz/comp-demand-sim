import {
  cloneBom,
  createCatalogId,
  emptyBomRow,
  planningYears,
} from './mvp-seed';

describe('planningYears', () => {
  it('returns a contiguous calendar-year range', () => {
    expect(planningYears(2026, 15)).toEqual(
      Array.from({ length: 15 }, (_, i) => 2026 + i),
    );
  });

  it('clamps horizon length to at least 1', () => {
    expect(planningYears(2030, 0)).toEqual([2030]);
  });
});

describe('createCatalogId', () => {
  it('slugifies the name', () => {
    const id = createCatalogId('component', 'My Widget', []);
    expect(id).toBe('my-widget');
  });

  it('avoids collisions with existing ids', () => {
    const id = createCatalogId('component', 'cpu', ['cpu']);
    expect(id).toBe('cpu-2');
    const id3 = createCatalogId('component', 'cpu', ['cpu', 'cpu-2']);
    expect(id3).toBe('cpu-3');
  });
});

describe('emptyBomRow', () => {
  it('initializes every component id to 0', () => {
    expect(emptyBomRow(['a', 'b'])).toEqual({ a: 0, b: 0 });
  });
});

describe('cloneBom', () => {
  it('deep-clones so nested mutation does not affect the default', () => {
    const a = cloneBom();
    const b = cloneBom();
    const firstKey = Object.keys(a)[0];
    const firstComp = Object.keys(a[firstKey])[0];
    a[firstKey][firstComp] = 999;
    expect(b[firstKey][firstComp]).not.toBe(999);
  });
});
