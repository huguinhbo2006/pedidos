import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
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
  template: `
    <section class="customers-page">
      <div class="page-header">
        <div>
          <h1>Clientes y Domicilios</h1>
          <p class="subtitle">Los clientes se crean automáticamente al dar de alta pedidos y acumulan sus domicilios.</p>
        </div>
      </div>

      <div class="card toolbar">
        <input
          type="text"
          [ngModel]="searchTerm"
          (ngModelChange)="onSearch($event)"
          placeholder="Buscar cliente por nombre o celular..."
          class="search-input"
        />
      </div>

      @if (loading()) {
        <div class="card empty-box">Cargando clientes...</div>
      } @else if (customers().length === 0) {
        <div class="card empty-box">
          Aún no hay clientes registrados. Se crearán en automático cuando registres el primer pedido.
        </div>
      } @else {
        <div class="customers-grid">
          @for (customer of customers(); track customer.id) {
            <article class="customer-card card">
              <div class="cust-head">
                <div>
                  <h3>{{ customer.name }}</h3>
                  <div class="phone">📞 {{ customer.phone }}</div>
                </div>
                <span class="badge badge-muted">{{ customer.orders_count ?? 0 }} pedido(s)</span>
              </div>

              <div class="addresses-section">
                <div class="sec-title">
                  Domicilios asignados ({{ customer.addresses?.length ?? 0 }})
                </div>
                @if (!(customer.addresses?.length)) {
                  <small class="muted">Sin domicilios guardados.</small>
                } @else {
                  <ul class="addr-list">
                    @for (addr of customer.addresses!; track addr.id) {
                      <li>
                        <div class="addr-info">
                          <span class="lbl">{{ addr.label || 'Domicilio' }}</span>
                          <span class="txt">{{ addr.address }}</span>
                          @if (addr.references) {
                            <small>Ref: {{ addr.references }}</small>
                          }
                        </div>
                        <button
                          type="button"
                          class="del-addr-btn"
                          title="Eliminar domicilio"
                          (click)="deleteAddress(customer, addr)"
                        >
                          🗑️
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .customers-page { display: flex; flex-direction: column; gap: 1.1rem; }
    .page-header {
      h1 { margin: 0; font-size: 1.55rem; font-weight: 800; }
      .subtitle { margin: 0.2rem 0 0; color: var(--text-secondary); font-size: 0.9rem; }
    }
    .toolbar { padding: 0.85rem 1rem; }
    .search-input {
      width: 100%;
      padding: 0.58rem 0.85rem;
      border: 1.5px solid var(--border-strong);
      border-radius: var(--radius-sm);
      font-size: 0.92rem;
    }
    .empty-box { padding: 2rem; text-align: center; color: var(--text-secondary); }
    .customers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1rem;
    }
    .customer-card {
      padding: 1.1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .cust-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
      h3 { margin: 0; font-size: 1.04rem; }
      .phone { font-size: 0.86rem; color: var(--text-secondary); font-weight: 600; margin-top: 0.15rem; }
    }
    .addresses-section {
      border-top: 1px solid var(--border-light);
      padding-top: 0.7rem;
      .sec-title {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-bottom: 0.45rem;
      }
      .muted { color: var(--text-muted); font-size: 0.84rem; }
    }
    .addr-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      li {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.5rem 0.65rem;
        background: var(--bg-canvas);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-light);
      }
      .addr-info {
        display: flex;
        flex-direction: column;
        gap: 0.12rem;
        .lbl { font-size: 0.74rem; font-weight: 800; color: var(--brand-primary); }
        .txt { font-size: 0.84rem; font-weight: 600; }
        small { font-size: 0.76rem; color: var(--text-muted); }
      }
      .del-addr-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        opacity: 0.7;
        &:hover { opacity: 1; }
      }
    }
  `],
})
export class CustomersComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true);
  searchTerm = '';

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

  deleteAddress(customer: Customer, addr: CustomerAddress): void {
    if (!confirm(`¿Eliminar el domicilio "${addr.address}" de ${customer.name}?`)) return;
    this.api.deleteCustomerAddress(customer.id, addr.id).subscribe({
      next: () => {
        this.customers.update((list) =>
          list.map((c) =>
            c.id === customer.id
              ? { ...c, addresses: (c.addresses ?? []).filter((a) => a.id !== addr.id) }
              : c
          )
        );
        this.toast.success('Domicilio eliminado.');
      },
      error: () => this.toast.error('No se pudo eliminar el domicilio.'),
    });
  }
}
