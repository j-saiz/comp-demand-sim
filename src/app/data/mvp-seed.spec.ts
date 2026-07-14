import {
  cloneBom,
  createCatalogId,
  emptyBomRow,
} from './mvp-seed';

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
