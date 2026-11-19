import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Order } from '../../core/models/api.models';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="history-page">
      <div class="page-header">
        <div>
          <h1>Historial de Pedidos</h1>
          <p class="subtitle">Consulta todos los pedidos registrados (incluyendo los ya entregados).</p>
        </div>
      </div>

      <div class="card filters-bar">
        <div class="form-field">
          <label for="histDate">Fecha</label>
          <input id="histDate" type="date" [(ngModel)]="dateFilter" (ngModelChange)="loadOrders()" />
        </div>

        <div class="form-field">
          <label for="histStatus">Estado</label>
          <select id="histStatus" [(ngModel)]="statusFilter" (ngModelChange)="loadOrders()">
            <option value="all">Todos</option>
            <option value="delivered">Entregados</option>
            <option value="pending">Pendientes</option>
          </select>
        </div>

        <div class="form-field search-col">
          <label for="histSearch">Buscar</label>
          <input
            id="histSearch"
            type="text"
            [(ngModel)]="searchFilter"
            (keyup.enter)="loadOrders()"
            placeholder="Folio, cliente, celular o domicilio..."
          />
        </div>

        <button type="button" class="btn btn-outline" (click)="clearDate()">Ver todas las fechas</button>
        <button type="button" class="btn btn-primary" (click)="loadOrders()">Buscar</button>
      </div>

      @if (loading()) {
        <div class="card empty-box">Cargando historial...</div>
      } @else if (orders().length === 0) {
        <div class="card empty-box">No hay pedidos que coincidan con los filtros.</div>
      } @else {
        <div class="history-list">
          @for (order of orders(); track order.id) {
            <article class="hist-card card">
              <div class="hist-top">
                <div class="folio-wrap">
                  <strong>{{ order.order_number }}</strong>
                  <span>{{ order.created_at | date:'medium' }}</span>
                </div>
                <span class="badge" [class.badge-delivered]="order.is_delivered" [class.badge-pending]="!order.is_delivered">
                  {{ order.is_delivered ? '✅ Entregado' : '⏳ Pendiente' }}
                </span>
              </div>

              <div class="hist-mid">
                <div><strong>Cliente:</strong> {{ order.customer_name }} ({{ order.customer_phone }})</div>
                <div><strong>Domicilio:</strong> {{ order.delivery_address }}</div>
                <div class="items-inline">
                  @for (item of order.items; track item.id ?? $index) {
                    <span class="item-chip" [class.promo]="item.is_promo">
                      {{ item.quantity }}x {{ item.product_name }}
                      @if (item.is_promo) { (🎁 Gratis) }
                    </span>
                  }
                </div>
              </div>

              <div class="hist-foot">
                <strong class="total">{{ formatCurrency(order.total) }}</strong>
                @if (order.delivered_at) {
                  <small class="delivered-at">Entregado: {{ order.delivered_at | date:'short' }}</small>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .history-page { display: flex; flex-direction: column; gap: 1.1rem; }
    .page-header {
      h1 { margin: 0; font-size: 1.55rem; font-weight: 800; }
      .subtitle { margin: 0.2rem 0 0; color: var(--text-secondary); font-size: 0.9rem; }
    }
    .filters-bar {
      padding: 1rem;
      display: flex;
      gap: 0.8rem;
      align-items: flex-end;
      flex-wrap: wrap;
      .search-col { flex: 1; min-width: 200px; }
    }
    .empty-box { padding: 2rem; text-align: center; color: var(--text-secondary); }
    .history-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .hist-card {
      padding: 1rem 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .hist-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      .folio-wrap {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        span { font-size: 0.82rem; color: var(--text-muted); }
      }
    }
    .hist-mid {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.88rem;
    }
    .items-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.25rem;
      .item-chip {
        font-size: 0.78rem;
        background: var(--bg-subtle);
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-weight: 600;
        &.promo {
          background: var(--bg-gold-soft);
          color: #92400e;
        }
      }
    }
    .hist-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--border-light);
      padding-top: 0.55rem;
      .total { font-size: 1.1rem; font-weight: 800; color: var(--brand-primary); }
      .delivered-at { font-size: 0.78rem; color: var(--brand-green); font-weight: 600; }
    }
  `],
})
export class HistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);

  dateFilter = this.todayIso();
  statusFilter: 'all' | 'pending' | 'delivered' = 'all';
  searchFilter = '';

  ngOnInit(): void {
    this.loadOrders();
  }

  private todayIso(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  clearDate(): void {
    this.dateFilter = '';
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading.set(true);
    this.api
      .getOrders({
        date: this.dateFilter || undefined,
        status: this.statusFilter,
        search: this.searchFilter.trim() || undefined,
      })
      .subscribe({
        next: (list) => {
          this.orders.set(list);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('No se pudo cargar el historial.');
        },
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount ?? 0);
  }
}
