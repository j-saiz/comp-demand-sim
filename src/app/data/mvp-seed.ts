import {
  Assembly,
  BomMatrix,
  ComponentDef,
  ScenarioDemandLine,
  SimulationSettings,
  UserScenario,
} from '../models/domain';

export const DEFAULT_COMPONENTS: ComponentDef[] = [
  { id: 'cpu', name: 'CPU', unit: 'units' },
  { id: 'gpu', name: 'GPU', unit: 'units' },
  { id: 'ram', name: 'RAM', unit: 'sticks' },
  { id: 'ssd', name: 'SSD', unit: 'units' },
  { id: 'motherboard', name: 'Motherboard', unit: 'units' },
  { id: 'psu', name: 'PSU', unit: 'units' },
  { id: 'case', name: 'Case', unit: 'units' },
];

/** Default assembly catalog (PC industry pack — engine is assembly-agnostic). */
export const DEFAULT_ASSEMBLIES: Assembly[] = [
  {
    id: 'office',
    name: 'Office PC',
    description: 'Standard productivity desktop without discrete GPU.',
  },
  {
    id: 'gaming',
    name: 'Gaming PC',
    description: 'Discrete GPU gaming configuration.',
  },
  {
    id: 'workstation',
    name: 'Workstation',
    description: 'Higher RAM and storage for creative/engineering workloads.',
  },
];

/** BOM: assemblyId -> componentId -> quantity per assembly unit */
export const DEFAULT_BOM: BomMatrix = {
  office: {
    cpu: 1,
    gpu: 0,
    ram: 2,
    ssd: 1,
    motherboard: 1,
    psu: 1,
    case: 1,
  },
  gaming: {
    cpu: 1,
    gpu: 1,
    ram: 2,
    ssd: 1,
    motherboard: 1,
    psu: 1,
    case: 1,
  },
  workstation: {
    cpu: 1,
    gpu: 1,
    ram: 4,
    ssd: 2,
    motherboard: 1,
    psu: 1,
    case: 1,
  },
};

export const COMPONENTS = DEFAULT_COMPONENTS;
export const ASSEMBLIES = DEFAULT_ASSEMBLIES;
export const BOM = DEFAULT_BOM;

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Default planning year for date → month binning. */
export const DEFAULT_PLANNING_YEAR = new Date().getFullYear();

export const DEFAULT_SETTINGS: SimulationSettings = {
  iterations: 2000,
  seed: 42,
  percentiles: [10, 25, 50, 75, 80, 90, 95],
  monthlyUncertaintyPct: 0.15,
  planningYear: DEFAULT_PLANNING_YEAR,
};

let lineSeq = 0;
let catalogSeq = 0;

export function createDemandLineId(): string {
  lineSeq += 1;
  return `line-${Date.now().toString(36)}-${lineSeq}`;
}

export function createCatalogId(
  prefix: string,
  name: string,
  existing: string[],
): string {
  catalogSeq += 1;
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || prefix;
  let id = base;
  let n = 2;
  while (existing.includes(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  if (existing.includes(id)) {
    id = `${prefix}-${catalogSeq}`;
  }
  return id;
}

export function createEmptyDemandLine(
  planningYear = DEFAULT_PLANNING_YEAR,
  defaultAssemblyId = 'office',
): ScenarioDemandLine {
  return {
    id: createDemandLineId(),
    assemblyId: defaultAssemblyId,
    quantity: 100,
    startDate: `${planningYear}-01-01`,
    endDate: `${planningYear}-12-31`,
    distribution: 'triangular',
  };
}

export function cloneComponents(): ComponentDef[] {
  return DEFAULT_COMPONENTS.map((c) => ({ ...c }));
}

export function cloneAssemblies(): Assembly[] {
  return DEFAULT_ASSEMBLIES.map((a) => ({ ...a }));
}

export function cloneBom(): BomMatrix {
  const out: BomMatrix = {};
  for (const [assemblyId, recipe] of Object.entries(DEFAULT_BOM)) {
    out[assemblyId] = { ...recipe };
  }
  return out;
}

export function emptyBomRow(componentIds: string[]): Record<string, number> {
  const row: Record<string, number> = {};
  for (const id of componentIds) {
    row[id] = 0;
  }
  return row;
}

let scenarioSeq = 0;

export function createScenarioId(existing: string[] = []): string {
  scenarioSeq += 1;
  let id = `scenario-${scenarioSeq}`;
  while (existing.includes(id)) {
    scenarioSeq += 1;
    id = `scenario-${scenarioSeq}`;
  }
  return id;
}

/** Deep-clone a scenario with new ids (for duplicate). */
export function cloneScenario(
  source: UserScenario,
  options?: { name?: string; existingIds?: string[]; quantityScale?: number },
): UserScenario {
  const scale = options?.quantityScale ?? 1;
  return {
    id: createScenarioId(options?.existingIds ?? []),
    name: options?.name ?? `${source.name} (copy)`,
    lines: source.lines.map((line) => ({
      ...line,
      id: createDemandLineId(),
      quantity: Math.max(0, Math.round(line.quantity * scale)),
    })),
  };
}

/** Starter baseline scenario with example assembly demand campaigns. */
export function createDefaultScenario(
  planningYear = DEFAULT_PLANNING_YEAR,
  defaultAssemblyIds: string[] = ['office', 'gaming', 'workstation'],
  id = 'baseline',
  name = 'Baseline',
): UserScenario {
  const [office, gaming, workstation] = [
    defaultAssemblyIds[0] ?? 'office',
    defaultAssemblyIds[1] ?? defaultAssemblyIds[0] ?? 'office',
    defaultAssemblyIds[2] ?? defaultAssemblyIds[0] ?? 'office',
  ];

  return {
    id,
    name,
    lines: [
      {
        id: createDemandLineId(),
        assemblyId: office,
        quantity: 800,
        startDate: `${planningYear}-01-01`,
        endDate: `${planningYear}-06-30`,
        distribution: 'triangular',
      },
      {
        id: createDemandLineId(),
        assemblyId: gaming,
        quantity: 500,
        startDate: `${planningYear}-03-01`,
        endDate: `${planningYear}-12-31`,
        distribution: 'uniform',
      },
      {
        id: createDemandLineId(),
        assemblyId: workstation,
        quantity: 200,
        startDate: `${planningYear}-01-15`,
        endDate: `${planningYear}-09-30`,
        distribution: 'triangular',
      },
    ],
  };
}

/** Default workspace: Baseline + High demand (scaled quantities). */
export function createDefaultScenarios(
  planningYear = DEFAULT_PLANNING_YEAR,
): UserScenario[] {
  const baseline = createDefaultScenario(planningYear);
  const high = cloneScenario(baseline, {
    name: 'High demand',
    existingIds: [baseline.id],
    quantityScale: 1.25,
  });
  // Stable id for seed high scenario
  high.id = 'high';
  return [baseline, high];
}
