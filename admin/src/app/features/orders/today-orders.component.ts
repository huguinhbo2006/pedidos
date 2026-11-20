import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Employee, Order, OrderItem, TodayOrdersResponse, WhatsAppDevice } from '../../core/models/api.models';

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
  readonly activeTab = signal<'today' | 'upcoming'>('today');
  readonly orders = signal<Order[]>([]);
  readonly upcomingOrders = signal<Order[]>([]);
  readonly summary = signal<TodayOrdersResponse['summary']>({
    pending_count: 0,
    delivered_count: 0,
    total_orders_today: 0,
    pending_amount: 0,
    delivered_amount: 0,
    total_sales_today: 0,
    upcoming_count: 0,
    upcoming_amount: 0,
  });
  readonly todayDate = signal<string>('');
  readonly confirmingOrder = signal<Order | null>(null);
  readonly deliveringId = signal<number | null>(null);
  readonly deletingOrder = signal<Order | null>(null);
  readonly isDeleting = signal(false);
  readonly downloadingPdfId = signal<number | null>(null);

  // WhatsApp Notification Modal State
  readonly whatsappModalOpen = signal(false);
  readonly whatsappTargetOrder = signal<Order | null>(null);
  readonly whatsappRecipientType = signal<'customer' | 'employee'>('customer');
  readonly whatsappEmployees = signal<Employee[]>([]);
  readonly whatsappSelectedEmployeeId = signal<number | null>(null);
  readonly whatsappDevices = signal<WhatsAppDevice[]>([]);
  readonly whatsappMessageText = signal('');
  readonly isSendingWhatsApp = signal(false);
  readonly whatsappSendPdf = signal<boolean>(false);
  readonly whatsappStatus = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Quick Edit Customer Modal State
  readonly editingCustomerOrder = signal<Order | null>(null);
  readonly editCustomerName = signal('');
  readonly editCustomerPhone = signal('');
  readonly isSavingCustomer = signal(false);
  readonly editCustomerError = signal<string | null>(null);

  readonly canSaveCustomerEdit = computed(() => {
    const nameValid = this.editCustomerName().trim().length >= 2;
    const phoneDigits = this.editCustomerPhone().replace(/\D+/g, '');
    return nameValid && phoneDigits.length >= 7;
  });

  readonly displayedOrders = computed(() =>
    this.activeTab() === 'today' ? this.orders() : this.upcomingOrders()
  );

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
        this.upcomingOrders.set(res.upcoming_orders || []);
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
        this.orders.update((list) => list.filter((o) => o.id !== order.id));
        this.upcomingOrders.update((list) => list.filter((o) => o.id !== order.id));
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
        this.upcomingOrders.update((list) => list.filter((o) => o.id !== order.id));
        this.summary.update((s) => ({
          ...s,
          pending_count: Math.max(0, s.pending_count - 1),
          pending_amount: Math.max(0, Number((s.pending_amount - order.total).toFixed(2))),
          total_sales_today: Math.max(0, Number((s.total_sales_today - order.total).toFixed(2))),
          upcoming_count: Math.max(0, (s.upcoming_count ?? 1) - 1),
        }));
        this.toast.success(res.message || 'Pedido eliminado correctamente.');
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.toast.error(err?.error?.message || 'Error al eliminar el pedido.');
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

  getTelUrl(phone?: string | null): string {
    if (!phone) return 'tel:';
    const clean = phone.replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  }

  formatDeliveryDate(val?: string | null): string {
    if (!val) return 'Hoy';
    const dateOnly = val.substring(0, 10);
    const today = this.todayDate();
    if (today && dateOnly === today) return 'Hoy';
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateOnly;
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

  // --- WhatsApp Order Notifications ---
  openWhatsAppModal(order: Order, defaultType: 'customer' | 'employee' = 'employee', withPdf = false): void {
    this.whatsappSendPdf.set(withPdf);
    this.whatsappTargetOrder.set(order);
    this.whatsappRecipientType.set(defaultType);
    this.whatsappStatus.set(null);
    this.whatsappSelectedEmployeeId.set(order.assigned_employee_id ?? null);

    if (this.whatsappEmployees().length === 0) {
      this.api.getEmployees(true).subscribe({
        next: (emps) => {
          this.whatsappEmployees.set(emps);
          if (!this.whatsappSelectedEmployeeId() && emps.length > 0) {
            this.whatsappSelectedEmployeeId.set(emps[0].id);
          }
          this.refreshWhatsAppMessagePreview();
        },
      });
    }

    if (this.whatsappDevices().length === 0) {
      this.api.getWhatsAppDevices().subscribe({
        next: (res) => this.whatsappDevices.set(res.devices),
      });
    }

    this.refreshWhatsAppMessagePreview();
    this.whatsappModalOpen.set(true);
  }

  closeWhatsAppModal(): void {
    if (this.isSendingWhatsApp()) return;
    this.whatsappModalOpen.set(false);
    this.whatsappTargetOrder.set(null);
    this.whatsappStatus.set(null);
  }

  setWhatsAppRecipientType(type: 'customer' | 'employee'): void {
    this.whatsappRecipientType.set(type);
    this.whatsappStatus.set(null);
    this.refreshWhatsAppMessagePreview();
  }

  onWhatsAppEmployeeChange(empId: any): void {
    const id = empId ? Number(empId) : null;
    this.whatsappSelectedEmployeeId.set(id);
    this.refreshWhatsAppMessagePreview();
  }

  formatDateInWords(val?: string | null): string {
    if (!val) {
      const today = new Date();
      const formatted = new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(today);
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    const dateOnly = val.substring(0, 10);
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const dateObj = new Date(year, month, day);

      const formatted = new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(dateObj);

      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return dateOnly;
  }

  formatPackageDetailsLines(item: OrderItem): string {
    if (!item.package_details) return '';
    let details: any[] = [];
    if (Array.isArray(item.package_details)) {
      details = item.package_details;
    } else if (typeof item.package_details === 'string') {
      try {
        details = JSON.parse(item.package_details);
      } catch {
        details = [];
      }
    }
    if (!details || details.length === 0) return '';

    let res = '';
    for (const det of details) {
      const qty = det.quantity ?? 1;
      const label = det.label || det.name || 'Opción';
      const extraPrice = Number(det.extra_price ?? 0);
      const extraStr = extraPrice > 0 ? ` (+ $${extraPrice.toFixed(2)} c/u)` : '';
      res += `   - ${qty}x ${label}${extraStr}\n`;
    }
    return res;
  }

  refreshWhatsAppMessagePreview(): void {
    const order = this.whatsappTargetOrder();
    if (!order) return;

    const type = this.whatsappRecipientType();
    const timeStr = this.formatDeliveryTime(order.delivery_time);

    if (type === 'employee') {
      const mapsUrl = this.getMapsUrl(order);
      const dateText = this.formatDateInWords(order.delivery_date);
      const refText = order.delivery_references ? ` (Ref: ${order.delivery_references})` : '';

      let itemsOnly = '';
      for (const it of order.items) {
        const promo = it.is_promo ? ' (PROMO)' : '';
        itemsOnly += `• ${it.quantity}x ${it.product_name}${promo}\n`;
        itemsOnly += this.formatPackageDetailsLines(it);
      }
      if (order.notes) {
        itemsOnly += `📝 Notas: ${order.notes}\n`;
      }

      const msg = `🗺️ *MAPA:*\n` +
        `${mapsUrl}\n` +
        `📍 ${order.delivery_address}${refText}\n\n` +
        `📱 *CELULAR:*\n` +
        `${order.customer_phone} (${order.customer_name})\n\n` +
        `📅 *FECHA Y HORA:*\n` +
        `${dateText} — ${timeStr}\n\n` +
        `💵 *TOTAL A COBRAR:*\n` +
        `$${Number(order.total).toFixed(2)} MXN\n\n` +
        `🌮 *PEDIDO (#${order.order_number}):*\n` +
        itemsOnly.trim();

      this.whatsappMessageText.set(msg);
    } else {
      const dateStr = this.formatDeliveryDate(order.delivery_date);
      let itemsText = '';
      for (const it of order.items) {
        const promo = it.is_promo ? ' (PROMO)' : '';
        itemsText += `• ${it.quantity}x ${it.product_name}${promo} - $${Number(it.line_total).toFixed(2)}\n`;
        itemsText += this.formatPackageDetailsLines(it);
      }

      const msg = `🌮 *TAQUERÍA MARY* 🌮\n` +
        `¡Hola, *${order.customer_name}*! Confirmamos tu pedido:\n\n` +
        `📋 *Pedido:* #${order.order_number}\n` +
        `📅 *Fecha de entrega:* ${dateStr}\n` +
        `⏰ *Hora estimada:* ${timeStr}\n` +
        `📍 *Dirección:* ${order.delivery_address}` +
        (order.delivery_references ? ` (Ref: ${order.delivery_references})` : '') +
        `\n\n🌮 *Tu orden:*\n${itemsText}\n` +
        `💰 *Total a pagar:* $${Number(order.total).toFixed(2)} MXN` +
        (order.promo_savings > 0 ? ` (Ahorro promos: $${Number(order.promo_savings).toFixed(2)})` : '') +
        (order.notes ? `\n💬 *Notas:* ${order.notes}` : '') +
        `\n\n¡Muchas gracias por tu preferencia! 🙌`;
      this.whatsappMessageText.set(msg);
    }
  }

  sendOrderWhatsApp(): void {
    const order = this.whatsappTargetOrder();
    if (!order) return;

    const type = this.whatsappRecipientType();
    const empId = this.whatsappSelectedEmployeeId();

    if (type === 'employee' && !empId) {
      this.whatsappStatus.set({
        type: 'error',
        message: 'Por favor selecciona al empleado o repartidor destinatario.',
      });
      return;
    }

    this.isSendingWhatsApp.set(true);
    this.whatsappStatus.set(null);

    this.api.sendOrderWhatsApp(order.id, {
      recipient_type: type,
      employee_id: empId ?? undefined,
      message: this.whatsappMessageText().trim(),
      send_pdf: this.whatsappSendPdf(),
    }).subscribe({
      next: (res) => {
        this.isSendingWhatsApp.set(false);
        this.whatsappStatus.set({
          type: 'success',
          message: res.message || '¡Mensaje de WhatsApp entregado exitosamente!',
        });
        this.toast.success('¡WhatsApp enviado!');
      },
      error: (err) => {
        this.isSendingWhatsApp.set(false);
        const errMsg = err?.error?.error || err?.error?.message || 'Error al enviar por WhatsApp. Verifica que la línea esté conectada.';
        this.whatsappStatus.set({
          type: 'error',
          message: errMsg,
        });
        this.toast.error(errMsg);
      },
    });
  }

  openDirectWhatsAppWeb(order: Order, type: 'customer' | 'employee'): void {
    let phone = order.customer_phone;
    if (type === 'employee') {
      const emp = this.whatsappEmployees().find((e) => e.id === this.whatsappSelectedEmployeeId());
      if (emp) phone = emp.phone;
    }
    const clean = phone.replace(/\D/g, '');
    const intl = clean.length === 10 ? `521${clean}` : clean;
    const text = encodeURIComponent(this.whatsappMessageText());
    window.open(`https://wa.me/${intl}?text=${text}`, '_blank');
  }

  // --- Quick Edit Customer from Order Card ---
  openEditCustomerModal(order: Order): void {
    this.editingCustomerOrder.set(order);
    this.editCustomerName.set(order.customer_name);
    this.editCustomerPhone.set(order.customer_phone);
    this.editCustomerError.set(null);
  }

  closeEditCustomerModal(): void {
    if (this.isSavingCustomer()) return;
    this.editingCustomerOrder.set(null);
    this.editCustomerError.set(null);
  }

  saveOrderCustomer(): void {
    const order = this.editingCustomerOrder();
    if (!order || this.isSavingCustomer()) return;

    const name = this.editCustomerName().trim();
    const phone = this.editCustomerPhone().trim();
    const digits = phone.replace(/\D+/g, '');

    if (name.length < 2) {
      this.editCustomerError.set('El nombre del cliente debe tener al menos 2 caracteres.');
      return;
    }

    if (digits.length < 7) {
      this.editCustomerError.set('Ingresa un número de celular válido (al menos 7 dígitos).');
      return;
    }

    this.isSavingCustomer.set(true);
    this.editCustomerError.set(null);

    this.api
      .updateCustomer(order.customer_id, {
        name,
        phone,
        sync_orders: true,
      })
      .subscribe({
        next: (updated) => {
          this.isSavingCustomer.set(false);
          this.editingCustomerOrder.set(null);

          const patchOrder = (o: Order): Order =>
            o.customer_id === updated.id
              ? { ...o, customer_name: updated.name, customer_phone: updated.phone }
              : o;

          this.orders.update((list) => list.map(patchOrder));
          this.upcomingOrders.update((list) => list.map(patchOrder));
          this.toast.success(`Cliente actualizado: ${updated.name} (${updated.phone}).`);
        },
        error: (err) => {
          this.isSavingCustomer.set(false);
          const firstValidation = err?.error?.errors
            ? Object.values(err.error.errors).flat()[0]
            : null;
          this.editCustomerError.set(
            (firstValidation as string) ||
              err?.error?.message ||
              'No se pudieron guardar los cambios del cliente.'
          );
        },
      });
  }
}
