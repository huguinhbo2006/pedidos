import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Order } from '../../core/models/api.models';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
                  <span>Capturado: {{ order.created_at | date:'medium' }}</span>
                </div>
                <span class="badge" [class.badge-delivered]="order.is_delivered" [class.badge-pending]="!order.is_delivered">
                  {{ order.is_delivered ? '✅ Entregado' : '⏳ Pendiente' }}
                </span>
              </div>

              <div class="hist-mid">
                <div><strong>Cliente:</strong> {{ order.customer_name }} ({{ order.customer_phone }})</div>
                <div><strong>Domicilio:</strong> {{ order.delivery_address }}</div>
                <div>
                  <strong>Entrega programada:</strong>
                  <span class="delivery-time-tag">
                    📅 {{ formatDeliveryDate(order.delivery_date) }} &nbsp;·&nbsp; ⏰ {{ formatDeliveryTime(order.delivery_time) }}
                  </span>
                </div>
                <div class="items-inline">
                  @for (item of order.items; track item.id ?? $index) {
                    <span class="item-chip" [class.promo]="item.is_promo">
                      {{ item.quantity }}x {{ item.product_name }}
                      @if (item.package_details?.length) {
                        ({{ formatPkgDetails(item.package_details!) }})
                      }
                      @if (item.is_promo) { (🎁 Regalo) }
                    </span>
                  }
                </div>
              </div>

              <div class="hist-foot">
                <div class="total-wrap">
                  <strong class="total">{{ formatCurrency(order.total) }}</strong>
                  @if (order.promo_discount_amount > 0 || order.manual_discount_amount > 0) {
                    <small class="discount-tag">
                      Descuentos: − {{ formatCurrency((order.promo_discount_amount || 0) + (order.manual_discount_amount || 0)) }}
                    </small>
                  }
                </div>
                <div class="foot-right">
                  @if (order.delivered_at) {
                    <small class="delivered-at">Entregado: {{ order.delivered_at | date:'short' }}</small>
                  }

                  <a
                    [routerLink]="['/pedidos/editar', order.id]"
                    class="btn btn-outline btn-sm"
                    title="Modificar pedido"
                  >
                    ✏️ Modificar
                  </a>

                  <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    [disabled]="downloadingPdfId() === order.id"
                    (click)="openPdf(order)"
                  >
                    {{ downloadingPdfId() === order.id ? 'PDF...' : '📄 PDF' }}
                  </button>

                  <button
                    type="button"
                    class="btn btn-danger-ghost btn-sm"
                    (click)="openConfirmDelete(order)"
                    title="Eliminar pedido definitivamente"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </article>
          }
        </div>
      }

      <!-- MODAL CONFIRM DELETE -->
      @if (deletingOrder(); as order) {
        <div class="modal-backdrop" (click)="cancelConfirmDelete()">
          <div class="modal-panel delete-panel" (click)="$event.stopPropagation()">
            <div class="confirm-head delete-head">
              <div class="delete-circle">🗑️</div>
              <div>
                <h3 class="text-danger">Eliminar Pedido</h3>
                <p>Folio <strong>{{ order.order_number }}</strong></p>
              </div>
            </div>

            <div class="confirm-body">
              <div class="summary-pill delete-pill">
                <div><strong>Cliente:</strong> {{ order.customer_name }} ({{ order.customer_phone }})</div>
                <div><strong>Domicilio:</strong> {{ order.delivery_address }}</div>
                <div><strong>Fecha de entrega:</strong> {{ formatDeliveryDate(order.delivery_date) }} · {{ formatDeliveryTime(order.delivery_time) }}</div>
                <div><strong>Total del pedido:</strong> {{ formatCurrency(order.total) }}</div>
              </div>

              <div class="alert alert-error" style="margin: 0;">
                ⚠️ <strong>¿Confirmas que deseas eliminar este pedido permanentemente?</strong>
                <p style="margin: 4px 0 0; font-size: 0.86rem;">
                  Esta acción es irreversible y eliminará el pedido y sus conceptos de la base de datos.
                </p>
              </div>
            </div>

            <div class="confirm-actions">
              <button
                type="button"
                class="btn btn-outline"
                (click)="cancelConfirmDelete()"
                [disabled]="isDeleting()"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="btn btn-danger"
                (click)="confirmDelete()"
                [disabled]="isDeleting()"
              >
                {{ isDeleting() ? 'Eliminando...' : '🗑️ Sí, eliminar pedido' }}
              </button>
            </div>
          </div>
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
      .folio-wrap {
        display: flex;
        gap: 0.65rem;
        align-items: baseline;
        strong { font-size: 1.05rem; color: var(--brand-primary); }
        span { font-size: 0.8rem; color: var(--text-muted); }
      }
    }
    .hist-mid {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.9rem;
    }
    .delivery-time-tag {
      display: inline-block;
      margin-left: 0.3rem;
      background: var(--bg-gold-soft);
      color: #9a5406;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-sm);
    }
    .items-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.25rem;
      .item-chip {
        background: var(--bg-subtle);
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-size: 0.8rem;
        &.promo {
          background: var(--bg-green-soft);
          color: var(--brand-green);
          font-weight: 600;
        }
      }
    }
    .hist-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px dashed var(--border-light);
      padding-top: 0.65rem;
      margin-top: 0.2rem;
    }
    .total-wrap {
      display: flex;
      flex-direction: column;
      .total { font-size: 1.15rem; font-weight: 800; }
      .discount-tag { font-size: 0.76rem; color: var(--brand-green); font-weight: 600; }
    }
    .foot-right {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      .delivered-at { font-size: 0.8rem; color: var(--text-muted); }
    }
    .badge-delivered { background: var(--bg-green-soft); color: var(--brand-green); }
    .badge-pending { background: #fff3db; color: #9a5406; }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(31, 23, 18, 0.45);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .modal-panel {
      background: var(--bg-surface);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 480px;
      overflow: hidden;
    }
    .confirm-head {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 1.15rem 1.35rem;
      border-bottom: 1px solid var(--border-light);
      h3 { margin: 0; font-size: 1.12rem; }
      p { margin: 0.15rem 0 0; font-size: 0.86rem; color: var(--text-secondary); }
    }
    .delete-circle {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #fef2f2;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
    }
    .confirm-body {
      padding: 1.2rem 1.35rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    .summary-pill {
      background: var(--bg-subtle);
      border-radius: var(--radius-sm);
      padding: 0.75rem 0.9rem;
      font-size: 0.88rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.65rem;
      padding: 0.95rem 1.35rem;
      background: var(--bg-canvas);
      border-top: 1px solid var(--border-light);
    }
    .text-danger { color: var(--brand-danger); }
  `],
})
export class HistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly orders = signal<Order[]>([]);
  readonly downloadingPdfId = signal<number | null>(null);
  readonly deletingOrder = signal<Order | null>(null);
  readonly isDeleting = signal(false);

  dateFilter = '';
  statusFilter: 'all' | 'pending' | 'delivered' = 'all';
  searchFilter = '';

  ngOnInit(): void {
    this.dateFilter = this.todayIso();
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

  openConfirmDelete(order: Order): void {
    this.deletingOrder.set(order);
  }

  cancelConfirmDelete(): void {
    if (this.isDeleting()) return;
    this.deletingOrder.set(null);
  }

  confirmDelete(): void {
    const order = this.deletingOrder();
    if (!order || this.isDeleting()) return;

    this.isDeleting.set(true);
    this.api.deleteOrder(order.id).subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.deletingOrder.set(null);
        this.orders.update((list) => list.filter((o) => o.id !== order.id));
        this.toast.success(res.message || 'Pedido eliminado correctamente.');
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.toast.error(err?.error?.message || 'Error al eliminar el pedido.');
      },
    });
  }

  formatDeliveryDate(val?: string | null): string {
    if (!val) return 'Hoy';
    const dateOnly = val.substring(0, 10);
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateOnly;
  }

  formatPkgDetails(details: Array<{ label: string; quantity: number }>): string {
    return details.map((d) => `${d.quantity}x ${d.label}`).join(', ');
  }

  openPdf(order: Order): void {
    this.downloadingPdfId.set(order.id);
    this.api.downloadOrderPdf(order.id).subscribe({
      next: (blob) => {
        this.downloadingPdfId.set(null);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => {
        this.downloadingPdfId.set(null);
        this.toast.error('No se pudo generar el PDF.');
      },
    });
  }

  formatDeliveryTime(val?: string | null): string {
    if (!val || !val.trim()) return 'Lo antes posible';
    const match = val.trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return val.trim();
    const h24 = Number(match[1]);
    const mins = match[2];
    const suffix = h24 >= 12 ? 'p. m.' : 'a. m.';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${mins} ${suffix}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount ?? 0);
  }
}
