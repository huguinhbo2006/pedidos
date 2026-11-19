import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { MealPackage, PackageGroup, Product, Promotion } from '../../core/models/api.models';

@Component({
  selector: 'app-packages-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="pkg-admin-page">
      <div class="page-header">
        <div>
          <h1>Paquetes y Promociones</h1>
          <p class="subtitle">Configura paquetes con límites por grupo, sabores permitidos, cargos extra y regalos promocionales.</p>
        </div>

        <div class="header-tabs">
          <button
            type="button"
            class="btn"
            [class.btn-primary]="activeTab() === 'packages'"
            [class.btn-outline]="activeTab() !== 'packages'"
            (click)="activeTab.set('packages')"
          >
            📦 Paquetes ({{ packages().length }})
          </button>
          <button
            type="button"
            class="btn"
            [class.btn-primary]="activeTab() === 'promotions'"
            [class.btn-outline]="activeTab() !== 'promotions'"
            (click)="activeTab.set('promotions')"
          >
            🎁 Promociones ({{ promotions().length }})
          </button>
        </div>
      </div>

      @if (activeTab() === 'packages') {
        <div class="section-actions">
          <button type="button" class="btn btn-primary" (click)="openNewPackage()">
            ➕ Nuevo Paquete
          </button>
        </div>

        @if (loading()) {
          <div class="card empty-box">Cargando paquetes...</div>
        } @else {
          <div class="cards-grid">
            @for (pkg of packages(); track pkg.id) {
              <article class="item-card card" [class.inactive]="!pkg.is_active">
                <div class="card-top">
                  <div>
                    <h3>{{ pkg.name }}</h3>
                    <strong class="price-tag">{{ formatCurrency(pkg.base_price) }}</strong>
                  </div>
                  <button
                    type="button"
                    class="status-pill"
                    [class.active]="pkg.is_active"
                    (click)="togglePackage(pkg)"
                  >
                    {{ pkg.is_active ? '● Activo' : '○ Inactivo' }}
                  </button>
                </div>

                @if (pkg.description) {
                  <p class="desc">{{ pkg.description }}</p>
                }

                <div class="groups-preview">
                  @for (g of pkg.groups; track g.id ?? $index) {
                    <div class="group-mini">
                      <div class="g-title">
                        <strong>{{ g.name }}</strong>
                        <span>({{ g.min_quantity }}–{{ g.max_quantity }} max)</span>
                      </div>
                      <div class="opt-chips">
                        @for (o of g.options; track o.id ?? $index) {
                          <span class="opt-chip">
                            {{ o.label }}
                            @if (o.extra_price > 0) {
                              <em>(+{{ formatCurrency(o.extra_price) }})</em>
                            }
                          </span>
                        }
                      </div>
                    </div>
                  }
                </div>

                <div class="card-actions">
                  <button type="button" class="btn btn-outline btn-sm" (click)="openEditPackage(pkg)">
                    Editar
                  </button>
                  <button type="button" class="btn btn-danger-ghost btn-sm" (click)="deletePackage(pkg)">
                    Eliminar
                  </button>
                </div>
              </article>
            }
          </div>
        }
      } @else {
        <div class="section-actions">
          <button type="button" class="btn btn-primary" (click)="openNewPromo()">
            ➕ Nueva Promoción
          </button>
        </div>

        <div class="cards-grid">
          @for (promo of promotions(); track promo.id) {
            <article class="item-card card" [class.inactive]="!promo.is_active">
              <div class="card-top">
                <div>
                  <h3>🎁 {{ promo.name }}</h3>
                  <small class="promo-meta">
                    {{ promo.applies_to_packages ? 'Aplica en compra de paquete' : 'Promoción general' }} · Máx. {{ promo.max_quantity }}
                  </small>
                </div>
                <button
                  type="button"
                  class="status-pill"
                  [class.active]="promo.is_active"
                  (click)="togglePromo(promo)"
                >
                  {{ promo.is_active ? '● Activa' : '○ Inactiva' }}
                </button>
              </div>

              @if (promo.description) {
                <p class="desc">{{ promo.description }}</p>
              }

              @if (promo.allowed_options.length) {
                <div class="opt-chips">
                  @for (opt of promo.allowed_options; track opt) {
                    <span class="opt-chip">{{ opt }}</span>
                  }
                </div>
              }

              <div class="card-actions">
                <button type="button" class="btn btn-outline btn-sm" (click)="openEditPromo(promo)">
                  Editar
                </button>
                <button type="button" class="btn btn-danger-ghost btn-sm" (click)="deletePromo(promo)">
                  Eliminar
                </button>
              </div>
            </article>
          }
        </div>
      }

      <!-- MODAL PAQUETE -->
      @if (showPkgModal()) {
        <div class="modal-backdrop" (click)="showPkgModal.set(false)">
          <div class="modal-panel wide-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h3>{{ editingPkg() ? 'Editar Paquete' : 'Nuevo Paquete' }}</h3>
              <button type="button" class="close-btn" (click)="showPkgModal.set(false)">✕</button>
            </div>

            <div class="modal-scroll">
              <div class="row-2">
                <div class="form-field">
                  <label>Nombre del paquete *</label>
                  <input type="text" [(ngModel)]="pkgForm.name" placeholder="Ej. Paquete Fiesta Básica" />
                </div>
                <div class="form-field">
                  <label>Precio base (MXN) *</label>
                  <input type="number" step="1" min="0" [(ngModel)]="pkgForm.base_price" />
                </div>
              </div>

              <div class="form-field">
                <label>Descripción</label>
                <input type="text" [(ngModel)]="pkgForm.description" placeholder="100 tacos + 5 litros de agua..." />
              </div>

              <div class="groups-editor">
                <div class="ge-head">
                  <strong>Grupos de selección (ej. Tacos, Aguas, Desechables)</strong>
                  <button type="button" class="btn btn-outline btn-sm" (click)="addGroup()">+ Agregar grupo</button>
                </div>

                @for (group of pkgForm.groups; track $index; let gi = $index) {
                  <div class="group-box">
                    <div class="row-3">
                      <div class="form-field">
                        <label>Nombre del grupo</label>
                        <input type="text" [(ngModel)]="group.name" placeholder="Tacos Dorados" />
                      </div>
                      <div class="form-field">
                        <label>Mínimo</label>
                        <input type="number" min="0" [(ngModel)]="group.min_quantity" />
                      </div>
                      <div class="form-field">
                        <label>Máximo permitido</label>
                        <input type="number" min="1" [(ngModel)]="group.max_quantity" />
                      </div>
                    </div>

                    <div class="opts-editor">
                      <div class="oe-head">
                        <small>Productos permitidos en este grupo (selecciona del catálogo):</small>
                        <button type="button" class="btn btn-outline btn-sm" (click)="addOption(gi)">+ Agregar producto</button>
                      </div>

                      <div class="opt-col-labels">
                        <span>Producto</span>
                        <span class="extra-lbl">Extra ($)</span>
                        <span></span>
                      </div>

                      @for (opt of group.options; track $index; let oi = $index) {
                        <div class="opt-edit-row">
                          <select
                            [ngModel]="opt.product_id"
                            (ngModelChange)="onOptionProductChange(gi, oi, $event)"
                            class="product-select"
                          >
                            <option [ngValue]="null" disabled>-- Selecciona un producto del catálogo --</option>
                            @for (catGroup of groupedProducts(); track catGroup.category) {
                              <optgroup [label]="catGroup.category">
                                @for (p of catGroup.items; track p.id) {
                                  <option [ngValue]="p.id">
                                    {{ p.name }} ({{ formatCurrency(p.price) }})
                                  </option>
                                }
                              </optgroup>
                            }
                          </select>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            [(ngModel)]="opt.extra_price"
                            title="Incremento extra por unidad"
                            placeholder="0"
                            class="extra-inp"
                          />
                          <button type="button" class="btn btn-danger-ghost btn-sm" (click)="removeOption(gi, oi)">✕</button>
                        </div>
                      }
                    </div>

                    @if (pkgForm.groups.length > 1) {
                      <button type="button" class="btn btn-danger-ghost btn-sm" (click)="removeGroup(gi)">
                        Quitar grupo
                      </button>
                    }
                  </div>
                }
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-outline" (click)="showPkgModal.set(false)">Cancelar</button>
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="savePackage()">
                {{ saving() ? 'Guardando...' : 'Guardar Paquete' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL PROMOCIÓN -->
      @if (showPromoModal()) {
        <div class="modal-backdrop" (click)="showPromoModal.set(false)">
          <div class="modal-panel" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h3>{{ editingPromo() ? 'Editar Promoción' : 'Nueva Promoción' }}</h3>
              <button type="button" class="close-btn" (click)="showPromoModal.set(false)">✕</button>
            </div>

            <div class="modal-scroll">
              <div class="form-field">
                <label>Nombre de la promoción *</label>
                <input type="text" [(ngModel)]="promoForm.name" placeholder="¡5 Litros de Agua Extra GRATIS!" />
              </div>

              <div class="form-field">
                <label>Descripción</label>
                <textarea rows="2" [(ngModel)]="promoForm.description"></textarea>
              </div>

              <div class="form-field">
                <label>Cantidad máxima de regalo</label>
                <input type="number" min="1" [(ngModel)]="promoForm.max_quantity" />
              </div>

              <div class="form-field">
                <label>Opciones a elegir (una por línea)</label>
                <textarea
                  rows="3"
                  [(ngModel)]="promoOptionsText"
                  placeholder="Agua de Horchata (1 Litro)&#10;Agua de Jamaica (1 Litro)"
                ></textarea>
              </div>

              <label class="checkbox-row">
                <input type="checkbox" [(ngModel)]="promoForm.applies_to_packages" />
                <span>Sugerir automáticamente al comprar un paquete</span>
              </label>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn btn-outline" (click)="showPromoModal.set(false)">Cancelar</button>
              <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="savePromo()">
                {{ saving() ? 'Guardando...' : 'Guardar Promoción' }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .pkg-admin-page { display: flex; flex-direction: column; gap: 1.1rem; }
    .page-header {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
      h1 { margin: 0; font-size: 1.55rem; font-weight: 800; }
      .subtitle { margin: 0.2rem 0 0; color: var(--text-secondary); font-size: 0.9rem; }
    }
    .header-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .section-actions { display: flex; justify-content: flex-end; }
    .empty-box { padding: 2rem; text-align: center; color: var(--text-secondary); }
    .cards-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem;
    }
    .item-card {
      padding: 1.1rem; display: flex; flex-direction: column; gap: 0.75rem;
      &.inactive { opacity: 0.6; }
    }
    .card-top {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;
      h3 { margin: 0; font-size: 1.05rem; }
      .price-tag { font-size: 1.2rem; color: var(--brand-primary); font-weight: 800; }
      .promo-meta { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
    }
    .desc { margin: 0; font-size: 0.85rem; color: var(--text-secondary); }
    .groups-preview { display: flex; flex-direction: column; gap: 0.55rem; }
    .group-mini {
      background: var(--bg-canvas); border: 1px solid var(--border-light);
      border-radius: var(--radius-sm); padding: 0.55rem 0.7rem;
      .g-title { display: flex; gap: 0.4rem; align-items: center; font-size: 0.82rem; margin-bottom: 0.35rem; }
      span { color: var(--text-muted); }
    }
    .opt-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .opt-chip {
      font-size: 0.75rem; font-weight: 600; background: #fff;
      border: 1px solid var(--border-light); padding: 0.16rem 0.5rem; border-radius: 999px;
      em { font-style: normal; color: #9a5406; font-weight: 700; }
    }
    .card-actions { display: flex; justify-content: flex-end; gap: 0.45rem; margin-top: auto; }
    .status-pill {
      border: 1px solid var(--border-strong); background: var(--bg-subtle); color: var(--text-secondary);
      border-radius: 999px; padding: 0.24rem 0.65rem; font-size: 0.76rem; font-weight: 700; cursor: pointer;
      &.active { background: var(--bg-green-soft); border-color: #bbf7d0; color: var(--brand-green); }
    }
    .wide-modal { max-width: 720px; max-height: 90vh; display: flex; flex-direction: column; }
    .modal-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-light);
      h3 { margin: 0; }
    }
    .close-btn { border: none; background: transparent; font-size: 1.1rem; cursor: pointer; }
    .modal-scroll {
      padding: 1.1rem 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem;
    }
    .row-2 { display: grid; grid-template-columns: 1.5fr 1fr; gap: 0.75rem; }
    .row-3 { display: grid; grid-template-columns: 1.5fr 90px 120px; gap: 0.65rem; }
    .groups-editor { display: flex; flex-direction: column; gap: 0.75rem; }
    .ge-head { display: flex; justify-content: space-between; align-items: center; }
    .group-box {
      border: 1px solid var(--border-strong); border-radius: var(--radius-md);
      padding: 0.85rem; background: var(--bg-canvas); display: flex; flex-direction: column; gap: 0.65rem;
    }
    .opts-editor { display: flex; flex-direction: column; gap: 0.4rem; }
    .oe-head { display: flex; justify-content: space-between; align-items: center; }
    .opt-col-labels {
      display: flex; gap: 0.45rem; align-items: center;
      font-size: 0.72rem; font-weight: 700; color: var(--text-muted); padding: 0 0.1rem;
      span:first-child { flex: 1; }
      .extra-lbl { width: 95px; }
      span:last-child { width: 32px; }
    }
    .opt-edit-row {
      display: flex; gap: 0.45rem; align-items: center;
      .product-select {
        flex: 1; min-width: 0; padding: 0.44rem 0.6rem;
        border: 1px solid var(--border-strong); border-radius: 6px; background: #fff; font-size: 0.86rem;
      }
      .extra-inp {
        width: 95px; padding: 0.42rem 0.6rem;
        border: 1px solid var(--border-strong); border-radius: 6px;
      }
    }
    .checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 0.88rem; }
    .modal-actions {
      display: flex; justify-content: flex-end; gap: 0.6rem;
      padding: 0.9rem 1.25rem; border-top: 1px solid var(--border-light);
    }
  `],
})
export class PackagesAdminComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly activeTab = signal<'packages' | 'promotions'>('packages');
  readonly packages = signal<MealPackage[]>([]);
  readonly promotions = signal<Promotion[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly groupedProducts = computed(() => {
    const map = new Map<string, Product[]>();
    for (const p of this.products()) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  });

  readonly showPkgModal = signal(false);
  readonly editingPkg = signal<MealPackage | null>(null);
  pkgForm: { name: string; description: string; base_price: number; groups: PackageGroup[] } = {
    name: '',
    description: '',
    base_price: 0,
    groups: [],
  };

  readonly showPromoModal = signal(false);
  readonly editingPromo = signal<Promotion | null>(null);
  promoForm = { name: '', description: '', max_quantity: 5, applies_to_packages: true };
  promoOptionsText = '';

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.api.getPackages().subscribe({
      next: (list) => {
        this.packages.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.getPromotions().subscribe({
      next: (list) => this.promotions.set(list),
    });
    this.api.getProducts().subscribe({
      next: (list) => this.products.set(list),
    });
  }

  openNewPackage(): void {
    this.editingPkg.set(null);
    this.pkgForm = {
      name: '',
      description: '',
      base_price: 600,
      groups: [
        {
          name: 'Tacos Dorados',
          min_quantity: 1,
          max_quantity: 100,
          options: [
            { product_id: null, label: '', extra_price: 0, is_active: true },
          ],
        },
      ],
    };
    this.showPkgModal.set(true);
  }

  openEditPackage(pkg: MealPackage): void {
    this.editingPkg.set(pkg);
    this.pkgForm = {
      name: pkg.name,
      description: pkg.description ?? '',
      base_price: pkg.base_price,
      groups: pkg.groups.map((g) => ({
        name: g.name,
        min_quantity: g.min_quantity,
        max_quantity: g.max_quantity,
        options: g.options.map((o) => ({
          product_id: o.product_id,
          label: o.label,
          extra_price: o.extra_price,
          is_active: o.is_active,
        })),
      })),
    };
    this.showPkgModal.set(true);
  }

  addGroup(): void {
    this.pkgForm.groups.push({
      name: 'Nuevo grupo',
      min_quantity: 0,
      max_quantity: 10,
      options: [{ product_id: null, label: '', extra_price: 0, is_active: true }],
    });
  }

  removeGroup(index: number): void {
    this.pkgForm.groups.splice(index, 1);
  }

  addOption(groupIndex: number): void {
    this.pkgForm.groups[groupIndex].options.push({
      product_id: null,
      label: '',
      extra_price: 0,
      is_active: true,
    });
  }

  onOptionProductChange(groupIndex: number, optIndex: number, productId: number | null): void {
    const id = productId ? Number(productId) : null;
    const prod = id ? this.products().find((p) => p.id === id) : undefined;
    const opt = this.pkgForm.groups[groupIndex].options[optIndex];
    opt.product_id = prod ? prod.id : id;
    opt.label = prod ? prod.name : '';
  }

  removeOption(groupIndex: number, optIndex: number): void {
    this.pkgForm.groups[groupIndex].options.splice(optIndex, 1);
  }

  savePackage(): void {
    if (!this.pkgForm.name.trim() || this.pkgForm.groups.length === 0) {
      this.toast.error('Completa el nombre y al menos un grupo.');
      return;
    }

    for (const grp of this.pkgForm.groups) {
      if (!grp.name.trim() || grp.options.length === 0) {
        this.toast.error('Cada grupo debe tener un nombre y al menos un producto.');
        return;
      }
      for (const opt of grp.options) {
        if (!opt.product_id || !opt.label.trim()) {
          this.toast.error(`Selecciona un producto del catálogo en "${grp.name}".`);
          return;
        }
      }
    }

    this.saving.set(true);
    const editing = this.editingPkg();
    const req$ = editing
      ? this.api.updatePackage(editing.id, this.pkgForm)
      : this.api.createPackage(this.pkgForm);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showPkgModal.set(false);
        this.toast.success('Paquete guardado.');
        this.loadAll();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'No se pudo guardar el paquete.');
      },
    });
  }

  togglePackage(pkg: MealPackage): void {
    this.api.togglePackage(pkg.id).subscribe({
      next: (updated) => {
        this.packages.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      },
    });
  }

  deletePackage(pkg: MealPackage): void {
    if (!confirm(`¿Eliminar "${pkg.name}"?`)) return;
    this.api.deletePackage(pkg.id).subscribe({
      next: () => {
        this.packages.update((list) => list.filter((p) => p.id !== pkg.id));
        this.toast.success('Paquete eliminado.');
      },
      error: (err) => this.toast.error(err?.error?.message || 'No se pudo eliminar.'),
    });
  }

  openNewPromo(): void {
    this.editingPromo.set(null);
    this.promoForm = { name: '', description: '', max_quantity: 5, applies_to_packages: true };
    this.promoOptionsText = 'Agua de Horchata (1 Litro)\nAgua de Jamaica (1 Litro)';
    this.showPromoModal.set(true);
  }

  openEditPromo(promo: Promotion): void {
    this.editingPromo.set(promo);
    this.promoForm = {
      name: promo.name,
      description: promo.description ?? '',
      max_quantity: promo.max_quantity,
      applies_to_packages: promo.applies_to_packages,
    };
    this.promoOptionsText = (promo.allowed_options ?? []).join('\n');
    this.showPromoModal.set(true);
  }

  savePromo(): void {
    if (!this.promoForm.name.trim()) {
      this.toast.error('Ingresa el nombre de la promoción.');
      return;
    }

    const payload = {
      ...this.promoForm,
      allowed_options: this.promoOptionsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    this.saving.set(true);
    const editing = this.editingPromo();
    const req$ = editing
      ? this.api.updatePromotion(editing.id, payload)
      : this.api.createPromotion(payload);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showPromoModal.set(false);
        this.toast.success('Promoción guardada.');
        this.loadAll();
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('No se pudo guardar la promoción.');
      },
    });
  }

  togglePromo(promo: Promotion): void {
    this.api.togglePromotion(promo.id).subscribe({
      next: (updated) => {
        this.promotions.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      },
    });
  }

  deletePromo(promo: Promotion): void {
    if (!confirm(`¿Eliminar promoción "${promo.name}"?`)) return;
    this.api.deletePromotion(promo.id).subscribe({
      next: () => {
        this.promotions.update((list) => list.filter((p) => p.id !== promo.id));
        this.toast.success('Promoción eliminada.');
      },
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount ?? 0);
  }
}
