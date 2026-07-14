import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.html',
  styleUrl: './nav.scss',
})
export class Nav {
  readonly links = [
    { path: '/', label: 'Home', exact: true },
    { path: '/simulator', label: 'Simulator', exact: false },
    { path: '/about', label: 'About', exact: false },
  ] as const;
}
