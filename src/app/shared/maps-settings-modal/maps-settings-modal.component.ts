import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { GoogleMapsService } from '../../core/services/google-maps.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-maps-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h3>🗺️ Configuración de Google Maps</h3>
            <p>Activa el autocompletado oficial de Google Places y vista de mapa interactivo.</p>
          </div>
          <button type="button" class="close-btn" (click)="closed.emit()">✕</button>
        </div>

        <form (ngSubmit)="save()" class="modal-body">
          <div class="form-field">
            <label for="gmapsKey">Google Maps API Key (con Places API y Maps JavaScript API)</label>
            <input
              id="gmapsKey"
              type="text"
              [(ngModel)]="apiKey"
              name="apiKey"
              placeholder="AIzaSy..."
              autocomplete="off"
            />
            <small class="hint">
              También puedes configurarla en <code>backend/.env</code> con <code>GOOGLE_MAPS_API_KEY</code>.
              Si se deja vacío, la app usará búsqueda geográfica de respaldo.
            </small>
          </div>

          <div class="form-field">
            <label for="gmapsRegion">Código de país para priorizar direcciones</label>
            <input
              id="gmapsRegion"
              type="text"
              [(ngModel)]="region"
              name="region"
              maxlength="5"
              placeholder="mx"
            />
          </div>

          @if (mapsService.googleError()) {
            <div class="alert alert-warning">{{ mapsService.googleError() }}</div>
          }

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" (click)="closed.emit()">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Guardando...' : 'Guardar y aplicar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.15rem 1.35rem;
      border-bottom: 1px solid var(--border-light);

      h3 { margin: 0; font-size: 1.08rem; }
      p { margin: 0.25rem 0 0; font-size: 0.84rem; color: var(--text-secondary); }
    }
    .close-btn {
      background: transparent;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0.2rem 0.45rem;
      border-radius: 6px;
      &:hover { background: var(--bg-subtle); color: var(--text-primary); }
    }
    .modal-body {
      padding: 1.25rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .hint {
      font-size: 0.78rem;
      color: var(--text-muted);
      code {
        background: var(--bg-subtle);
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.65rem;
      margin-top: 0.35rem;
    }
  `],
})
export class MapsSettingsModalComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly mapsService = inject(GoogleMapsService);
  private readonly toast = inject(ToastService);

  @Output() closed = new EventEmitter<void>();

  apiKey = '';
  region = 'mx';
  readonly saving = signal(false);

  ngOnInit(): void {
    const cfg = this.mapsService.config();
    this.apiKey = cfg?.api_key ?? '';
    this.region = cfg?.region ?? 'mx';
  }

  save(): void {
    this.saving.set(true);
    this.api
      .updateMapsConfig({
        api_key: this.apiKey.trim() || null,
        region: this.region.trim() || 'mx',
      })
      .subscribe({
        next: async () => {
          await this.mapsService.loadConfigAndInit(true);
          this.saving.set(false);
          this.toast.success('Configuración de Google Maps actualizada.');
          this.closed.emit();
        },
        error: () => {
          this.saving.set(false);
          this.toast.error('No se pudo guardar la configuración de Maps.');
        },
      });
  }
}
