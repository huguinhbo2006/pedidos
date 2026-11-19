import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Order, TodayOrdersResponse } from '../../core/models/api.models';

@Component({
  selector: 'app-today-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './today-orders.component.html',
  styleUrl: './today-orders.component.scss',
})
export class TodayOrdersComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly orders = signal<Order[]>([]);
  readonly summary = signal<TodayOrdersResponse['summary']>({
    pending_count: 0,
    delivered_count: 0,
    total_orders_today: 0,
    pending_amount: 0,
    delivered_amount: 0,
    total_sales_today: 0,
  });
  readonly todayDate = signal<string>('');
  readonly confirmingOrder = signal<Order | null>(null);
  readonly deliveringId = signal<number | null>(null);
  readonly downloadingPdfId = signal<number | null>(null);

  searchTerm = '';
  private readonly search$ = new Subject<string>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.loadOrders();
    this.sub = this.search$
      .pipe(debounceTime(260), distinctUntilChanged())
      .subscribe((term) => this.loadOrders(term));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onSearchChange(value: string): void {
    this.searchTerm = value;
    this.search$.next(value);
  }

  loadOrders(search = this.searchTerm): void {
    this.loading.set(true);
    this.api.getTodayOrders(search.trim() || undefined).subscribe({
      next: (res) => {
        this.orders.set(res.orders);
        this.summary.set(res.summary);
        this.todayDate.set(res.date);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los pedidos del día.');
      },
    });
  }

  openConfirmDeliver(order: Order): void {
    this.confirmingOrder.set(order);
  }

  cancelConfirmDeliver(): void {
    if (this.deliveringId() !== null) return;
    this.confirmingOrder.set(null);
  }

  confirmDeliver(): void {
    const order = this.confirmingOrder();
    if (!order || this.deliveringId() !== null) return;

    this.deliveringId.set(order.id);
    this.api.markOrderDelivered(order.id).subscribe({
      next: (res) => {
        this.deliveringId.set(null);
        this.confirmingOrder.set(null);
        // Remove from main screen immediately even though it is from today
        this.orders.update((list) => list.filter((o) => o.id !== order.id));
        this.summary.update((s) => ({
          ...s,
          pending_count: Math.max(0, s.pending_count - 1),
          delivered_count: s.delivered_count + 1,
          pending_amount: Math.max(0, Number((s.pending_amount - order.total).toFixed(2))),
          delivered_amount: Number((s.delivered_amount + order.total).toFixed(2)),
        }));
        this.toast.success(res.message);
      },
      error: () => {
        this.deliveringId.set(null);
        this.toast.error('Ocurrió un error al confirmar la entrega.');
      },
    });
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
        this.toast.error('No se pudo generar el PDF del pedido.');
      },
    });
  }

  getMapsUrl(order: Order): string {
    if (order.delivery_lat != null && order.delivery_lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`;
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
