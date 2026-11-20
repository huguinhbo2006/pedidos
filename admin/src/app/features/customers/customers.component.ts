import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Customer, CustomerAddress } from '../../core/models/api.models';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss',
})
export class CustomersComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true);
  searchTerm = '';

  // Edit Customer Modal State
  readonly editingCustomer = signal<Customer | null>(null);
  readonly formName = signal('');
  readonly formPhone = signal('');
  readonly formNotes = signal('');
  readonly formSyncOrders = signal(true);
  readonly isSaving = signal(false);
  readonly editError = signal<string | null>(null);

  // Delete Address Modal State
  readonly deletingAddressTarget = signal<{ customer: Customer; address: CustomerAddress } | null>(null);
  readonly isDeletingAddress = signal(false);

  readonly canSaveEdit = computed(() => {
    const nameValid = this.formName().trim().length >= 2;
    const phoneDigits = this.formPhone().replace(/\D+/g, '');
    return nameValid && phoneDigits.length >= 7;
  });

  private readonly search$ = new Subject<string>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.loadCustomers();
    this.sub = this.search$
      .pipe(debounceTime(260), distinctUntilChanged())
      .subscribe((term) => this.loadCustomers(term));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onSearch(value: string): void {
    this.searchTerm = value;
    this.search$.next(value);
  }

  loadCustomers(search = this.searchTerm): void {
    this.loading.set(true);
    this.api.getCustomers(search.trim() || undefined).subscribe({
      next: (list) => {
        this.customers.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los clientes.');
      },
    });
  }

  openEditModal(customer: Customer): void {
    this.editingCustomer.set(customer);
    this.formName.set(customer.name);
    this.formPhone.set(customer.phone);
    this.formNotes.set(customer.notes ?? '');
    this.formSyncOrders.set(true);
    this.editError.set(null);
  }

  closeEditModal(): void {
    if (this.isSaving()) return;
    this.editingCustomer.set(null);
    this.editError.set(null);
  }

  saveCustomer(): void {
    const customer = this.editingCustomer();
    if (!customer || this.isSaving()) return;

    const name = this.formName().trim();
    const phone = this.formPhone().trim();
    const digits = phone.replace(/\D+/g, '');

    if (name.length < 2) {
      this.editError.set('El nombre del cliente debe tener al menos 2 caracteres.');
      return;
    }

    if (digits.length < 7) {
      this.editError.set('Ingresa un número de celular válido (al menos 7 dígitos).');
      return;
    }

    this.isSaving.set(true);
    this.editError.set(null);

    this.api
      .updateCustomer(customer.id, {
        name,
        phone,
        notes: this.formNotes().trim() || null,
        sync_orders: this.formSyncOrders(),
      })
      .subscribe({
        next: (updated) => {
          this.isSaving.set(false);
          this.editingCustomer.set(null);
          this.customers.update((list) =>
            list.map((c) => (c.id === updated.id ? updated : c))
          );
          this.toast.success(`Datos de "${updated.name}" actualizados correctamente.`);
        },
        error: (err) => {
          this.isSaving.set(false);
          const firstValidation = err?.error?.errors
            ? Object.values(err.error.errors).flat()[0]
            : null;
          this.editError.set(
            (firstValidation as string) ||
              err?.error?.message ||
              'No se pudieron guardar los cambios del cliente.'
          );
        },
      });
  }

  openDeleteAddressModal(customer: Customer, address: CustomerAddress): void {
    this.deletingAddressTarget.set({ customer, address });
  }

  closeDeleteAddressModal(): void {
    if (this.isDeletingAddress()) return;
    this.deletingAddressTarget.set(null);
  }

  confirmDeleteAddress(): void {
    const target = this.deletingAddressTarget();
    if (!target || this.isDeletingAddress()) return;

    this.isDeletingAddress.set(true);
    this.api.deleteCustomerAddress(target.customer.id, target.address.id).subscribe({
      next: () => {
        this.isDeletingAddress.set(false);
        this.deletingAddressTarget.set(null);
        this.customers.update((list) =>
          list.map((c) =>
            c.id === target.customer.id
              ? {
                  ...c,
                  addresses: (c.addresses ?? []).filter((a) => a.id !== target.address.id),
                }
              : c
          )
        );
        this.toast.success('Domicilio eliminado.');
      },
      error: () => {
        this.isDeletingAddress.set(false);
        this.toast.error('No se pudo eliminar el domicilio.');
      },
    });
  }

  getTelUrl(phone?: string | null): string {
    if (!phone) return 'tel:';
    const clean = phone.replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  }
}
