import { Component, inject } from '@angular/core';
import {
  SimStateService,
  SimulatorTabId,
} from '../../services/sim-state.service';
import { AssumptionsTab } from './tabs/assumptions-tab/assumptions-tab';
import { ResultsTab } from './tabs/results-tab/results-tab';
import { RunSimulationTab } from './tabs/run-simulation-tab/run-simulation-tab';

interface SimulatorTab {
  id: SimulatorTabId;
  label: string;
  description: string;
}

@Component({
  selector: 'app-simulator',
  imports: [AssumptionsTab, RunSimulationTab, ResultsTab],
  templateUrl: './simulator.html',
  styleUrl: './simulator.scss',
})
export class Simulator {
  readonly state = inject(SimStateService);

  readonly tabs: readonly SimulatorTab[] = [
    {
      id: 'assumptions',
      label: '1. Assumptions',
      description: 'Components, assemblies, and BOM',
    },
    {
      id: 'run',
      label: '2. Run simulation',
      description: 'Demand lines, settings, and execute',
    },
    {
      id: 'results',
      label: '3. Results',
      description: 'Stats, charts, and export',
    },
  ] as const;

  selectTab(tab: SimulatorTabId): void {
    this.state.selectTab(tab);
  }

  isActive(tab: SimulatorTabId): boolean {
    return this.state.activeTab() === tab;
  }

  tabButtonId(tab: SimulatorTabId): string {
    return `sim-tab-${tab}`;
  }

  panelId(tab: SimulatorTabId): string {
    return `sim-panel-${tab}`;
  }
}
