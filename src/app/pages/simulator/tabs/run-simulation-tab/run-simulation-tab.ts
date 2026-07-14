import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HelpTip } from '../../../../components/help-tip/help-tip';
import { MONTH_LABELS } from '../../../../data/mvp-seed';
import { DistributionType } from '../../../../models/domain';
import {
  allocateQuantityByMonth,
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
  readonly monthLabels = MONTH_LABELS;
  readonly distributionOptions = DISTRIBUTION_OPTIONS;

  readonly allocationPreview = computed(() => {
    const lines = this.state.activeScenario()?.lines ?? [];
    const year = this.state.settings().planningYear;
    const assemblies = this.state.assemblies();
    const rows: {
      lineId: string;
      assemblyName: string;
      month: number;
      monthLabel: string;
      units: number;
    }[] = [];

    for (const line of lines) {
      const monthly = allocateQuantityByMonth(
        Math.max(0, Math.round(Number(line.quantity) || 0)),
        line.startDate,
        line.endDate,
        year,
      );
      for (const [month, units] of monthly) {
        if (units <= 0) continue;
        rows.push({
          lineId: line.id,
          assemblyName: assemblyName(line.assemblyId, assemblies),
          month,
          monthLabel: MONTH_LABELS[month - 1] ?? String(month),
          units,
        });
      }
    }

    return rows.sort(
      (a, b) =>
        a.month - b.month || a.assemblyName.localeCompare(b.assemblyName),
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

  onLineStartChange(lineId: string, startDate: string): void {
    this.state.updateDemandLine(lineId, { startDate });
  }

  onLineEndChange(lineId: string, endDate: string): void {
    this.state.updateDemandLine(lineId, { endDate });
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

  onPlanningYearChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ planningYear: Math.round(n) });
    }
  }

  onUncertaintyChange(value: number | string): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      this.state.updateSettings({ monthlyUncertaintyPct: n / 100 });
    }
  }

  uncertaintyPctDisplay(): number {
    return Math.round(this.state.settings().monthlyUncertaintyPct * 100);
  }

  run(): void {
    this.state.run();
  }

  viewResults(): void {
    this.state.selectTab('results');
  }

  goToAssumptions(): void {
    this.state.selectTab('assumptions');
  }
}
