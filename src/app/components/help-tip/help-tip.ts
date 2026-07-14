import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'app-help-tip',
  templateUrl: './help-tip.html',
  styleUrl: './help-tip.scss',
})
export class HelpTip {
  readonly label = input.required<string>();
  readonly text = input.required<string>();
  readonly open = signal(false);

  toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }
}
