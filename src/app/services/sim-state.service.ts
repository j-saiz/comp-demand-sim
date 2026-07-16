import { computed, inject, Injectable, signal } from '@angular/core';
import {
  Assembly,
  BomMatrix,
  ComponentDef,
  ScenarioDemandLine,
  ScenarioResultView,
  SimulationSettings,
  UserScenario,
} from '../models/domain';
import {
  cloneAssemblies,
  cloneBom,
  cloneComponents,
  cloneScenario,
  createCatalogId,
  createDefaultScenarios,
  createEmptyDemandLine,
  createScenarioId,
  DEFAULT_SETTINGS,
  emptyBomRow,
} from '../data/mvp-seed';
import { normalizeDistribution } from './scenario-forecast';
import { MonteCarloService } from './monte-carlo.service';
import { ExportCsvService } from './export-csv.service';
import {
  buildAnnualDeltas,
  rankByDeltaP90,
  summarizeScenarios,
  yearlyMeansByScenario,
} from './scenario-compare';

export type SimulatorTabId = 'assumptions' | 'run' | 'results';

@Injectable({ providedIn: 'root' })
export class SimStateService {
  private readonly monteCarlo = inject(MonteCarloService);
  private readonly exportCsv = inject(ExportCsvService);

  readonly activeTab = signal<SimulatorTabId>('assumptions');

  /** Editable catalog (shared across scenarios) */
  readonly components = signal<ComponentDef[]>(cloneComponents());
  readonly assemblies = signal<Assembly[]>(cloneAssemblies());
  readonly bom = signal<BomMatrix>(cloneBom());

  /** Multi-scenario workspace */
  private readonly initialScenarios = createDefaultScenarios();
  readonly scenarios = signal<UserScenario[]>(this.initialScenarios);
  readonly activeScenarioId = signal<string>(this.initialScenarios[0].id);
  /** Scenarios included when running comparison */
  readonly compareScenarioIds = signal<string[]>(
    this.initialScenarios.map((s) => s.id),
  );
  /** Baseline for delta columns (defaults to first scenario) */
  readonly baselineScenarioId = signal<string>(this.initialScenarios[0].id);

  readonly settings = signal<SimulationSettings>({ ...DEFAULT_SETTINGS });
  readonly isRunning = signal(false);
  readonly error = signal<string | null>(null);
  readonly catalogError = signal<string | null>(null);

  /** Results keyed by scenario id from last successful run */
  readonly resultsByScenarioId = signal<Record<string, ScenarioResultView>>({});
  /** Which scenario's full detail is shown on Results */
  readonly detailScenarioId = signal<string | null>(null);

  readonly selectedChartComponentId = signal<string>('__all__');
  /** Component id for cross-scenario yearly mean chart */
  readonly compareChartComponentId = signal<string>('cpu');
  readonly lastRunAt = signal<string | null>(null);

  readonly activeScenario = computed(() => {
    const id = this.activeScenarioId();
    return (
      this.scenarios().find((s) => s.id === id) ?? this.scenarios()[0] ?? null
    );
  });

  readonly hasResults = computed(
    () => Object.keys(this.resultsByScenarioId()).length > 0,
  );

  readonly comparedResults = computed(() => {
    const map = this.resultsByScenarioId();
    return this.compareScenarioIds()
      .map((id) => map[id])
      .filter((r): r is ScenarioResultView => !!r);
  });

  readonly primaryResult = computed(() => {
    const detailId =
      this.detailScenarioId() ??
      this.baselineScenarioId() ??
      this.activeScenarioId();
    const map = this.resultsByScenarioId();
    return map[detailId] ?? Object.values(map)[0] ?? null;
  });

  readonly annualDeltas = computed(() =>
    buildAnnualDeltas(this.comparedResults(), this.baselineScenarioId()),
  );

  readonly sensitivityRanking = computed(() =>
    rankByDeltaP90(this.annualDeltas()),
  );

  readonly scenarioSummaries = computed(() =>
    summarizeScenarios(this.comparedResults()),
  );

  readonly lineCount = computed(
    () => this.activeScenario()?.lines.length ?? 0,
  );
  readonly totalUnits = computed(
    () =>
      this.activeScenario()?.lines.reduce(
        (sum, line) => sum + (line.quantity || 0),
        0,
      ) ?? 0,
  );
  readonly defaultAssemblyId = computed(() => this.assemblies()[0]?.id ?? '');

  selectTab(tab: SimulatorTabId): void {
    this.activeTab.set(tab);
    this.scrollWorkspaceToTop();
  }

  /** Keep the viewport at the top when switching workflow steps. */
  private scrollWorkspaceToTop(): void {
    // Defer past the click/focus cycle and tab re-render so the browser does not
    // re-scroll to the (now gone) button mid-page.
    setTimeout(() => {
      const main = document.getElementById('main-content');
      if (main) {
        main.scrollTop = 0;
        main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      // Move focus to main without scrolling to a mid-page control.
      main?.focus({ preventScroll: true });
    }, 0);
  }

  // ── Settings ─────────────────────────────────────────────────────

  updateSettings(partial: Partial<SimulationSettings>): void {
    this.settings.update((s) => ({ ...s, ...partial }));
  }

  // ── Multi-scenario CRUD ──────────────────────────────────────────

  selectScenario(id: string): void {
    if (this.scenarios().some((s) => s.id === id)) {
      this.activeScenarioId.set(id);
    }
  }

  setDetailScenario(id: string): void {
    if (this.resultsByScenarioId()[id] || this.scenarios().some((s) => s.id === id)) {
      this.detailScenarioId.set(id);
    }
  }

  setBaselineScenario(id: string): void {
    if (this.scenarios().some((s) => s.id === id)) {
      this.baselineScenarioId.set(id);
    }
  }

  toggleCompareScenario(id: string, included: boolean): void {
    this.compareScenarioIds.update((ids) => {
      if (included) {
        return ids.includes(id) ? ids : [...ids, id];
      }
      const next = ids.filter((x) => x !== id);
      // Keep at least one compared if possible
      return next.length > 0 ? next : ids;
    });
  }

  updateScenarioName(name: string): void {
    const id = this.activeScenarioId();
    this.scenarios.update((list) =>
      list.map((s) => (s.id === id ? { ...s, name } : s)),
    );
  }

  addScenario(): void {
    const { planningStartYear, planningHorizonYears } = this.settings();
    const assemblyId = this.defaultAssemblyId();
    const existing = this.scenarios().map((s) => s.id);
    const id = createScenarioId(existing);
    const sc: UserScenario = {
      id,
      name: `Scenario ${this.scenarios().length + 1}`,
      lines: assemblyId
        ? [
            createEmptyDemandLine(
              planningStartYear,
              planningHorizonYears,
              assemblyId,
            ),
          ]
        : [],
    };
    this.scenarios.update((list) => [...list, sc]);
    this.activeScenarioId.set(id);
    this.compareScenarioIds.update((ids) =>
      ids.includes(id) ? ids : [...ids, id],
    );
  }

  duplicateActiveScenario(): void {
    const source = this.activeScenario();
    if (!source) return;
    const copy = cloneScenario(source, {
      name: `${source.name} (copy)`,
      existingIds: this.scenarios().map((s) => s.id),
    });
    this.scenarios.update((list) => [...list, copy]);
    this.activeScenarioId.set(copy.id);
    this.compareScenarioIds.update((ids) => [...ids, copy.id]);
  }

  removeScenario(id: string): void {
    if (this.scenarios().length <= 1) {
      this.error.set('Keep at least one scenario.');
      return;
    }
    const remaining = this.scenarios().filter((s) => s.id !== id);
    this.scenarios.set(remaining);

    this.compareScenarioIds.update((ids) => {
      const next = ids.filter((x) => x !== id);
      return next.length > 0 ? next : [remaining[0].id];
    });

    if (this.activeScenarioId() === id) {
      this.activeScenarioId.set(remaining[0].id);
    }
    if (this.baselineScenarioId() === id) {
      this.baselineScenarioId.set(remaining[0].id);
    }
    if (this.detailScenarioId() === id) {
      this.detailScenarioId.set(remaining[0].id);
    }

    this.resultsByScenarioId.update((map) => {
      const { [id]: _removed, ...rest } = map;
      return rest;
    });
  }

  // ── Demand lines (active scenario) ───────────────────────────────

  addDemandLine(): void {
    const { planningStartYear, planningHorizonYears } = this.settings();
    const assemblyId = this.defaultAssemblyId();
    if (!assemblyId) {
      this.error.set(
        'Add at least one assembly on the Assumptions tab before adding demand lines.',
      );
      return;
    }
    this.updateActiveScenario((sc) => ({
      ...sc,
      lines: [
        ...sc.lines,
        createEmptyDemandLine(
          planningStartYear,
          planningHorizonYears,
          assemblyId,
        ),
      ],
    }));
  }

  removeDemandLine(lineId: string): void {
    this.updateActiveScenario((sc) => ({
      ...sc,
      lines: sc.lines.filter((l) => l.id !== lineId),
    }));
  }

  updateDemandLine(
    lineId: string,
    partial: Partial<Omit<ScenarioDemandLine, 'id'>>,
  ): void {
    this.updateActiveScenario((sc) => ({
      ...sc,
      lines: sc.lines.map((line) =>
        line.id === lineId ? { ...line, ...partial } : line,
      ),
    }));
  }

  private updateActiveScenario(
    fn: (sc: UserScenario) => UserScenario,
  ): void {
    const id = this.activeScenarioId();
    this.scenarios.update((list) =>
      list.map((s) => (s.id === id ? fn(s) : s)),
    );
  }

  // ── Components ───────────────────────────────────────────────────

  addComponent(name = 'New component', unit = 'units'): void {
    this.catalogError.set(null);
    const trimmed = name.trim() || 'New component';
    const existing = this.components().map((c) => c.id);
    const id = createCatalogId('component', trimmed, existing);

    this.components.update((list) => [
      ...list,
      { id, name: trimmed, unit: unit.trim() || 'units' },
    ]);

    this.bom.update((matrix) => {
      const next: BomMatrix = {};
      for (const [assemblyId, recipe] of Object.entries(matrix)) {
        next[assemblyId] = { ...recipe, [id]: 0 };
      }
      for (const assembly of this.assemblies()) {
        if (!next[assembly.id]) {
          next[assembly.id] = emptyBomRow([...existing, id]);
        }
      }
      return next;
    });
  }

  updateComponent(
    componentId: string,
    partial: Partial<Pick<ComponentDef, 'name' | 'unit'>>,
  ): void {
    this.catalogError.set(null);
    this.components.update((list) =>
      list.map((c) => (c.id === componentId ? { ...c, ...partial } : c)),
    );
  }

  removeComponent(componentId: string): void {
    this.catalogError.set(null);
    if (this.components().length <= 1) {
      this.catalogError.set('Keep at least one component in the catalog.');
      return;
    }

    this.components.update((list) => list.filter((c) => c.id !== componentId));
    this.bom.update((matrix) => {
      const next: BomMatrix = {};
      for (const [assemblyId, recipe] of Object.entries(matrix)) {
        const { [componentId]: _removed, ...rest } = recipe;
        next[assemblyId] = rest;
      }
      return next;
    });

    if (this.selectedChartComponentId() === componentId) {
      this.selectedChartComponentId.set('__all__');
    }
    if (this.compareChartComponentId() === componentId) {
      this.compareChartComponentId.set(this.components()[0]?.id ?? '');
    }
  }

  // ── Assemblies ───────────────────────────────────────────────────

  addAssembly(name = 'New assembly', description = ''): void {
    this.catalogError.set(null);
    const trimmed = name.trim() || 'New assembly';
    const existing = this.assemblies().map((a) => a.id);
    const id = createCatalogId('assembly', trimmed, existing);
    const componentIds = this.components().map((c) => c.id);

    this.assemblies.update((list) => [
      ...list,
      {
        id,
        name: trimmed,
        description: description.trim(),
      },
    ]);

    this.bom.update((matrix) => ({
      ...matrix,
      [id]: emptyBomRow(componentIds),
    }));
  }

  updateAssembly(
    assemblyId: string,
    partial: Partial<Pick<Assembly, 'name' | 'description'>>,
  ): void {
    this.catalogError.set(null);
    this.assemblies.update((list) =>
      list.map((a) => (a.id === assemblyId ? { ...a, ...partial } : a)),
    );
  }

  removeAssembly(assemblyId: string): void {
    this.catalogError.set(null);
    if (this.assemblies().length <= 1) {
      this.catalogError.set('Keep at least one assembly in the catalog.');
      return;
    }

    const remaining = this.assemblies().filter((a) => a.id !== assemblyId);
    const fallbackId = remaining[0]?.id;
    if (!fallbackId) return;

    this.assemblies.set(remaining);
    this.bom.update((matrix) => {
      const { [assemblyId]: _removed, ...rest } = matrix;
      return rest;
    });

    // Re-point demand lines in every scenario
    this.scenarios.update((list) =>
      list.map((sc) => ({
        ...sc,
        lines: sc.lines.map((line) =>
          line.assemblyId === assemblyId
            ? { ...line, assemblyId: fallbackId }
            : line,
        ),
      })),
    );
  }

  // ── BOM ──────────────────────────────────────────────────────────

  setBomQty(
    assemblyId: string,
    componentId: string,
    quantity: number | string,
  ): void {
    this.catalogError.set(null);
    const n = typeof quantity === 'number' ? quantity : Number(quantity);
    const qty = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;

    this.bom.update((matrix) => {
      const row = { ...(matrix[assemblyId] ?? {}) };
      row[componentId] = qty;
      return { ...matrix, [assemblyId]: row };
    });
  }

  bomQty(assemblyId: string, componentId: string): number {
    return this.bom()[assemblyId]?.[componentId] ?? 0;
  }

  // ── Run all compared scenarios ───────────────────────────────────

  run(): void {
    this.error.set(null);
    this.isRunning.set(true);

    setTimeout(() => {
      try {
        const settings = this.normalizeSettings(this.settings());
        this.settings.set(settings);

        // Normalize all scenarios first
        const normalized = this.scenarios().map((s) =>
          this.normalizeScenario(s),
        );
        this.scenarios.set(normalized);

        const catalog = {
          components: this.components().map((c) => ({ ...c })),
          assemblies: this.assemblies().map((a) => ({ ...a })),
          bom: this.cloneBomMatrix(this.bom()),
        };

        let compareIds = this.compareScenarioIds().filter((id) =>
          normalized.some((s) => s.id === id),
        );
        if (compareIds.length === 0) {
          compareIds = [this.activeScenarioId()];
          this.compareScenarioIds.set(compareIds);
        }

        const results: Record<string, ScenarioResultView> = {};
        for (const id of compareIds) {
          const sc = normalized.find((s) => s.id === id);
          if (!sc) continue;
          results[id] = this.monteCarlo.runUserScenario(sc, settings, catalog);
        }

        if (Object.keys(results).length === 0) {
          throw new Error('No scenarios selected for comparison.');
        }

        this.resultsByScenarioId.set(results);
        this.lastRunAt.set(new Date().toISOString());

        // Detail view: active if run, else baseline, else first result
        const detail =
          results[this.activeScenarioId()] != null
            ? this.activeScenarioId()
            : results[this.baselineScenarioId()] != null
              ? this.baselineScenarioId()
              : Object.keys(results)[0];
        this.detailScenarioId.set(detail);

        this.selectedChartComponentId.set('__all__');
        const firstComponent =
          results[detail]?.componentHorizon[0]?.componentId ?? 'cpu';
        this.compareChartComponentId.set(firstComponent);

        this.selectTab('results');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Simulation failed.';
        this.error.set(message);
        this.resultsByScenarioId.set({});
      } finally {
        this.isRunning.set(false);
      }
    }, 0);
  }

  exportCsvFile(): void {
    const results = this.comparedResults();
    if (results.length === 0) return;
    this.exportCsv.exportResults(results);
  }

  compareYearlySeries(componentId: string) {
    return yearlyMeansByScenario(this.comparedResults(), componentId);
  }

  /** @deprecated Use compareYearlySeries */
  compareMonthlySeries(componentId: string) {
    return this.compareYearlySeries(componentId);
  }

  private cloneBomMatrix(matrix: BomMatrix): BomMatrix {
    const out: BomMatrix = {};
    for (const [k, row] of Object.entries(matrix)) {
      out[k] = { ...row };
    }
    return out;
  }

  private normalizeSettings(settings: SimulationSettings): SimulationSettings {
    const iterations = Math.min(
      10_000,
      Math.max(1_000, Math.round(settings.iterations)),
    );
    const seed = Math.max(0, Math.floor(settings.seed));
    const percentiles = [10, 25, 50, 75, 80, 90, 95];
    const yearlyUncertaintyPct = Math.min(
      1,
      Math.max(0, settings.yearlyUncertaintyPct),
    );
    const planningStartYear = Math.round(settings.planningStartYear);
    const planningHorizonYears = Math.min(
      100,
      Math.max(1, Math.round(settings.planningHorizonYears)),
    );
    return {
      iterations,
      seed,
      percentiles,
      yearlyUncertaintyPct,
      planningStartYear,
      planningHorizonYears,
    };
  }

  private normalizeScenario(scenario: UserScenario): UserScenario {
    const validIds = new Set(this.assemblies().map((a) => a.id));
    const fallback = this.defaultAssemblyId();

    return {
      ...scenario,
      name: scenario.name.trim() || 'Custom scenario',
      lines: scenario.lines.map((line) => {
        const startYear = Math.round(Number(line.startYear));
        let endYear = Math.round(Number(line.endYear));
        if (!Number.isFinite(startYear)) {
          return {
            ...line,
            quantity: Math.max(0, Math.round(Number(line.quantity) || 0)),
            assemblyId: validIds.has(line.assemblyId)
              ? line.assemblyId
              : fallback,
            startYear: this.settings().planningStartYear,
            endYear:
              this.settings().planningStartYear +
              this.settings().planningHorizonYears -
              1,
            distribution: normalizeDistribution(line.distribution),
          };
        }
        if (!Number.isFinite(endYear) || endYear < startYear) {
          endYear = startYear;
        }
        return {
          ...line,
          quantity: Math.max(0, Math.round(Number(line.quantity) || 0)),
          assemblyId: validIds.has(line.assemblyId) ? line.assemblyId : fallback,
          startYear,
          endYear,
          distribution: normalizeDistribution(line.distribution),
        };
      }),
    };
  }
}
