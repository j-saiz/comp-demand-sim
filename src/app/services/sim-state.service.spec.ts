import { TestBed } from '@angular/core/testing';
import { SimStateService } from './sim-state.service';

describe('SimStateService', () => {
  let service: SimStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SimStateService);
  });

  it('starts with multiple default scenarios', () => {
    expect(service.scenarios().length).toBeGreaterThanOrEqual(2);
    expect(service.activeScenario()).toBeTruthy();
    expect(service.components().length).toBeGreaterThan(0);
    expect(service.assemblies().length).toBeGreaterThan(0);
  });

  it('adds a component and inserts 0 into every assembly BOM row', () => {
    const beforeAssemblies = service.assemblies().map((a) => a.id);
    service.addComponent('Widget', 'pcs');
    const added = service.components().find((c) => c.name === 'Widget');
    expect(added).toBeTruthy();
    expect(added!.unit).toBe('pcs');

    for (const assemblyId of beforeAssemblies) {
      expect(service.bomQty(assemblyId, added!.id)).toBe(0);
    }
  });

  it('removes a component from the catalog and BOM', () => {
    if (service.components().length <= 1) {
      service.addComponent('Extra');
    }
    const toRemove = service.components()[0].id;
    service.removeComponent(toRemove);
    expect(service.components().some((c) => c.id === toRemove)).toBe(false);
    for (const assembly of service.assemblies()) {
      expect(service.bom()[assembly.id][toRemove]).toBeUndefined();
    }
  });

  it('refuses to remove the last component', () => {
    while (service.components().length > 1) {
      service.removeComponent(service.components()[0].id);
    }
    service.removeComponent(service.components()[0].id);
    expect(service.components().length).toBe(1);
    expect(service.catalogError()).toMatch(/at least one component/i);
  });

  it('adds an assembly with an empty BOM row', () => {
    service.addAssembly('Thin Client', 'Low power');
    const added = service.assemblies().find((a) => a.name === 'Thin Client');
    expect(added).toBeTruthy();
    const row = service.bom()[added!.id];
    for (const c of service.components()) {
      expect(row[c.id]).toBe(0);
    }
  });

  it('repoints demand lines in all scenarios when an assembly is removed', () => {
    const [first, second] = service.assemblies();
    expect(second).toBeTruthy();

    const lineId = service.activeScenario()!.lines[0].id;
    service.updateDemandLine(lineId, { assemblyId: second.id });
    service.removeAssembly(second.id);

    for (const sc of service.scenarios()) {
      for (const line of sc.lines) {
        expect(line.assemblyId).not.toBe(second.id);
      }
    }
  });

  it('clamps BOM quantities to nonnegative integers', () => {
    const assemblyId = service.assemblies()[0].id;
    const componentId = service.components()[0].id;
    service.setBomQty(assemblyId, componentId, -3.7);
    expect(service.bomQty(assemblyId, componentId)).toBe(0);
    service.setBomQty(assemblyId, componentId, 2.6);
    expect(service.bomQty(assemblyId, componentId)).toBe(3);
  });

  it('duplicates the active scenario', () => {
    const before = service.scenarios().length;
    const name = service.activeScenario()!.name;
    service.duplicateActiveScenario();
    expect(service.scenarios().length).toBe(before + 1);
    expect(service.activeScenario()!.name).toContain(name);
    expect(service.compareScenarioIds()).toContain(service.activeScenarioId());
  });

  it('adds demand lines using the default assembly and year range', () => {
    const before = service.lineCount();
    service.addDemandLine();
    expect(service.lineCount()).toBe(before + 1);
    const last = service.activeScenario()!.lines.at(-1)!;
    expect(last.assemblyId).toBe(service.defaultAssemblyId());
    expect(last.startYear).toBe(service.settings().planningStartYear);
    expect(last.endYear).toBe(
      service.settings().planningStartYear +
        service.settings().planningHorizonYears -
        1,
    );
  });

  it('defaults to a 15-year planning horizon', () => {
    expect(service.settings().planningHorizonYears).toBe(15);
    expect(service.settings().planningStartYear).toBeGreaterThanOrEqual(2000);
  });

  it('keeps at least one scenario when removing', () => {
    while (service.scenarios().length > 1) {
      service.removeScenario(service.scenarios()[0].id);
    }
    service.removeScenario(service.scenarios()[0].id);
    expect(service.scenarios().length).toBe(1);
  });
});
