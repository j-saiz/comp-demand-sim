import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HelpTip } from '../../../../components/help-tip/help-tip';
import { planningYears } from '../../../../data/mvp-seed';
import { DistributionType } from '../../../../models/domain';
import {
  allocateQuantityByYear,
  assemblyName,
  DISTRIBUTION_OPTIONS,
} from '../../../../services/scenario-forecast';
import { SimStateService } from '../../../../services/sim-state.service';

@Component({
  selector: 'app-run-simulation-tab',
  imports: [FormsModule, HelpTip],
  templateUrl: './run-simulation-tab.html',
  styleUrl: './run-simulation-tab.scss',
})
export class RunSimulationTab {
  readonly state = inject(SimStateService);
  readonly distributionOptions = DISTRIBUTION_OPTIONS;

  readonly horizonLabel = computed(() => {
    const s = this.state.settings();
    const years = planningYears(
      s.planningStartYear,
      s.planningHorizonYears,
    );
    if (years.length === 0) return '';
    return `${years[0]}–${years[years.length - 1]}`;
  });

  readonly allocationPreview = computed(() => {
    const lines = this.state.activeScenario()?.lines ?? [];
    const s = this.state.settings();
    const horizon = planningYears(
      s.planningStartYear,
      s.planningHorizonYears,
    );
    const assemblies = this.state.assemblies();
    const rows: {
      lineId: string;
      assemblyName: string;
      year: number;
      units: number;
    }[] = [];

    for (const line of lines) {
      const yearly = allocateQuantityByYear(
        Math.max(0, Math.round(Number(line.quantity) || 0)),
        Math.round(Number(line.startYear)),
        Math.round(Number(line.endYear)),
        horizon,
      );
      for (const [year, units] of yearly) {
        if (units <= 0) continue;
        rows.push({
          lineId: line.id,
          assemblyName: assemblyName(line.assemblyId, assemblies),
          year,
          units,
        });
      }
    }

    return rows.sort(
      (a, b) =>
        a.year - b.year || a.assemblyName.localeCompare(b.assemblyName),
    );
  });

  selectScenario(id: string): void {
    this.state.selectScenario(id);
  }

  isCompared(id: string): boolean {
    return this.state.compareScenarioIds().includes(id);
  }

  onCompareToggle(id: string, checked: boolean): void {
    this.state.toggleCompareScenario(id, checked);
  }

  onBaselineChange(id: string): void {
    this.state.setBaselineScenario(id);
  }

  onScenarioNameChange(name: string): void {
    this.state.updateScenarioName(name);
  }

  addScenario(): void {
    this.state.addScenario();
  }

  duplicateScenario(): void {
    this.state.duplicateActiveScenario();
  }

  removeScenario(id: string): void {
    this.state.removeScenario(id);
  }

  onLineAssemblyChange(lineId: string, assemblyId: string): void {
    this.state.updateDemandLine(lineId, { assemblyId });
  }

  onLineQuantityChange(lineId: string, value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateDemandLine(lineId, { quantity: n });
    }
  }

  onLineStartYearChange(lineId: string, value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateDemandLine(lineId, { startYear: Math.round(n) });
    }
  }

  onLineEndYearChange(lineId: string, value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateDemandLine(lineId, { endYear: Math.round(n) });
    }
  }

  onLineDistributionChange(lineId: string, distribution: string): void {
    this.state.updateDemandLine(lineId, {
      distribution: distribution as DistributionType,
    });
  }

  addLine(): void {
    this.state.addDemandLine();
  }

  removeLine(lineId: string): void {
    this.state.removeDemandLine(lineId);
  }

  onIterationsChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ iterations: n });
    }
  }

  onSeedChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ seed: n });
    }
  }

  onPlanningStartYearChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ planningStartYear: Math.round(n) });
    }
  }

  onPlanningHorizonYearsChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ planningHorizonYears: Math.round(n) });
    }
  }

  onUncertaintyChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ yearlyUncertaintyPct: n / 100 });
    }
  }

  uncertaintyPctDisplay(): number {
    return Math.round(this.state.settings().yearlyUncertaintyPct * 100);
  }

  run(): void {
    this.state.run();
  }

  goToAssumptions(): void {
    this.state.selectTab('assumptions');
  }
}
