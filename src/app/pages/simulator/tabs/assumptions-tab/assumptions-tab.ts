import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HelpTip } from '../../../../components/help-tip/help-tip';
import { SimStateService } from '../../../../services/sim-state.service';

@Component({
  selector: 'app-assumptions-tab',
  imports: [FormsModule, HelpTip],
  templateUrl: './assumptions-tab.html',
  styleUrl: './assumptions-tab.scss',
})
export class AssumptionsTab {
  readonly state = inject(SimStateService);

  addComponent(): void {
    this.state.addComponent();
  }

  removeComponent(id: string): void {
    this.state.removeComponent(id);
  }

  onComponentName(id: string, name: string): void {
    this.state.updateComponent(id, { name });
  }

  onComponentUnit(id: string, unit: string): void {
    this.state.updateComponent(id, { unit });
  }

  addAssembly(): void {
    this.state.addAssembly();
  }

  removeAssembly(id: string): void {
    this.state.removeAssembly(id);
  }

  onAssemblyName(id: string, name: string): void {
    this.state.updateAssembly(id, { name });
  }

  onAssemblyDescription(id: string, description: string): void {
    this.state.updateAssembly(id, { description });
  }

  onBomQty(
    assemblyId: string,
    componentId: string,
    value: number | string,
  ): void {
    this.state.setBomQty(assemblyId, componentId, value);
  }

  goToRun(): void {
    this.state.selectTab('run');
  }
}
