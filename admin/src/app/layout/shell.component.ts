import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { GoogleMapsService } from '../core/services/google-maps.service';
import { ToastService } from '../core/services/toast.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly mapsService = inject(GoogleMapsService);
  readonly toast = inject(ToastService);
  readonly router = inject(Router);

  ngOnInit(): void {
    this.auth.fetchMe().subscribe();
    void this.mapsService.loadConfigAndInit();
  }

  logout(): void {
    this.auth.logout();
  }
}
