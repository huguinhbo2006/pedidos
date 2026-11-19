import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import {
  MealPackage,
  PackageGroup,
  Product,
  Promotion,
  PromotionComboItem,
  PromotionRewardProduct,
  PromotionTargetScope,
  PromotionType,
} from '../../core/models/api.models';

@Component({
  selector: 'app-packages-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="pkg-admin-page">
      <div class="page-header">
        <div>
          <h1>Paquetes y Promociones</h1>
          <p class="subtitle">Configura paquetes con límites, productos gratis, descuentos en $ o % y combos a precio fijo.</p>
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
                  <span class="badge badge-promo mb-xs">{{ promoTypeLabel(promo.type) }}</span>
                  <h3>{{ promo.name }}</h3>
                  <small class="promo-meta">{{ promoScopeSummary(promo) }}</small>
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

              @if (promo.type === 'free_product') {
                <div class="group-mini">
                  <div class="g-title"><strong>Regalos permitidos (máx. {{ promo.max_quantity }}):</strong></div>
                  <div class="opt-chips">
                    @for (r of (promo.reward_products || []); track r.product_id) {
                      <span class="opt-chip">🎁 {{ r.label }}</span>
                    } @empty {
                      @for (opt of promo.allowed_options; track opt) {
                        <span class="opt-chip">🎁 {{ opt }}</span>
                      }
                    }
                  </div>
                </div>
              } @else if (promo.type === 'discount') {
                <div class="promo-highlight-val">
                  Descuento:
                  <strong>
                    {{ promo.discount_type === 'percent' ? (promo.discount_value + '%') : formatCurrency(promo.discount_value || 0) }}
                  </strong>
                </div>
              } @else if (promo.type === 'fixed_price_combo') {
                <div class="group-mini">
                  <div class="g-title">
                    <strong>Precio fijo combo:</strong>
                    <span class="price-inline">{{ formatCurrency(promo.fixed_price || 0) }}</span>
                  </div>
                  <div class="opt-chips">
                    @for (ci of (promo.combo_items || []); track $index) {
                      <span class="opt-chip">{{ ci.quantity }}x {{ ci.label }}</span>
                    }
                  </div>
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

      <!-- MODAL PROMOCIÓN (3 TIPOS) -->
      @if (showPromoModal()) {
        <div class="modal-backdrop" (click)="showPromoModal.set(false)">
          <div class="modal-panel wide-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <h3>{{ editingPromo() ? 'Editar Promoción' : 'Nueva Promoción' }}</h3>
              <button type="button" class="close-btn" (click)="showPromoModal.set(false)">✕</button>
            </div>

            <div class="modal-scroll">
              <div class="form-field">
                <label>Tipo de promoción *</label>
                <div class="promo-type-grid">
                  <button
                    type="button"
                    class="ptype-btn"
                    [class.active]="promoForm.type === 'free_product'"
                    (click)="promoForm.type = 'free_product'"
                  >
                    <strong>🎁 Producto Gratis</strong>
                    <small>Regalo por compra de paquete, producto o monto</small>
                  </button>
                  <button
                    type="button"
                    class="ptype-btn"
                    [class.active]="promoForm.type === 'discount'"
                    (click)="promoForm.type = 'discount'"
                  >
                    <strong>💸 Descuento ($ o %)</strong>
                    <small>Descuento sobre paquete, producto o total</small>
                  </button>
                  <button
                    type="button"
                    class="ptype-btn"
                    [class.active]="promoForm.type === 'fixed_price_combo'"
                    (click)="promoForm.type = 'fixed_price_combo'"
                  >
                    <strong>📦 Combo Precio Fijo</strong>
                    <small>Escoges productos y les das un total fijo</small>
                  </button>
                </div>
              </div>

              <div class="row-2">
                <div class="form-field">
                  <label>Nombre de la promoción *</label>
                  <input type="text" [(ngModel)]="promoForm.name" placeholder="Ej. 5% desc. en paquetes o Combo 50 tacos" />
                </div>
                @if (promoForm.type === 'fixed_price_combo') {
                  <div class="form-field">
                    <label>Precio final fijo (MXN) *</label>
                    <input type="number" step="1" min="0" [(ngModel)]="promoForm.fixed_price" />
                  </div>
                } @else if (promoForm.type === 'free_product') {
                  <div class="form-field">
                    <label>Cantidad máxima de regalo *</label>
                    <input type="number" min="1" [(ngModel)]="promoForm.max_quantity" />
                  </div>
                } @else {
                  <div class="form-field">
                    <label>Tipo y valor de descuento *</label>
                    <div class="inline-disc-edit">
                      <select [(ngModel)]="promoForm.discount_type">
                        <option value="percent">% Porcentaje</option>
                        <option value="fixed">$ Pesos fijos</option>
                      </select>
                      <input type="number" step="0.5" min="0" [(ngModel)]="promoForm.discount_value" />
                    </div>
                  </div>
                }
              </div>

              <div class="form-field">
                <label>Descripción (opcional)</label>
                <input type="text" [(ngModel)]="promoForm.description" placeholder="Detalles visibles al capturar el pedido..." />
              </div>

              <!-- CONDICIÓN DE APLICACIÓN (para Tipo 1 y Tipo 2) -->
              @if (promoForm.type === 'free_product' || promoForm.type === 'discount') {
                <div class="group-box">
                  <div class="row-2">
                    <div class="form-field">
                      <label>¿Sobre qué se aplica esta promoción?</label>
                      <select [(ngModel)]="promoForm.target_scope">
                        <option value="all_packages">Todos los paquetes</option>
                        <option value="packages">Paquetes específicos</option>
                        <option value="products">Productos específicos</option>
                        <option value="order_total">Total del pedido (monto mínimo)</option>
                      </select>
                    </div>

                    @if (promoForm.target_scope === 'order_total') {
                      <div class="form-field">
                        <label>Monto mínimo del pedido (MXN)</label>
                        <input type="number" min="0" step="10" [(ngModel)]="promoForm.min_order_amount" placeholder="500" />
                      </div>
                    } @else {
                      <div class="form-field">
                        <label>Cantidad mínima requerida</label>
                        <input type="number" min="1" [(ngModel)]="promoForm.min_quantity" />
                      </div>
                    }
                  </div>

                  @if (promoForm.target_scope === 'packages') {
                    <div class="check-grid-box">
                      <small>Selecciona los paquetes a los que aplica:</small>
                      <div class="check-grid">
                        @for (pkg of packages(); track pkg.id) {
                          <label class="check-pill" [class.checked]="isTargetPackageSelected(pkg.id)">
                            <input
                              type="checkbox"
                              [checked]="isTargetPackageSelected(pkg.id)"
                              (change)="toggleTargetPackage(pkg.id)"
                            />
                            <span>{{ pkg.name }} ({{ formatCurrency(pkg.base_price) }})</span>
                          </label>
                        }
                      </div>
                    </div>
                  }

                  @if (promoForm.target_scope === 'products') {
                    <div class="check-grid-box">
                      <small>Selecciona los productos del catálogo a los que aplica:</small>
                      <div class="check-grid">
                        @for (prod of products(); track prod.id) {
                          <label class="check-pill" [class.checked]="isTargetProductSelected(prod.id)">
                            <input
                              type="checkbox"
                              [checked]="isTargetProductSelected(prod.id)"
                              (change)="toggleTargetProduct(prod.id)"
                            />
                            <span>{{ prod.name }} ({{ formatCurrency(prod.price) }})</span>
                          </label>
                        }
                      </div>
                    </div>
                  }
                </div>
              }

              <!-- PRODUCTOS DE REGALO (Tipo 1) -->
              @if (promoForm.type === 'free_product') {
                <div class="group-box">
                  <div class="oe-head">
                    <strong>Productos gratis que puede escoger el cliente:</strong>
                    <button type="button" class="btn btn-outline btn-sm" (click)="addRewardProduct()">
                      + Agregar producto regalo
                    </button>
                  </div>

                  @for (rew of promoForm.reward_products; track $index; let ri = $index) {
                    <div class="opt-edit-row">
                      <select
                        [ngModel]="rew.product_id"
                        (ngModelChange)="onRewardProductChange(ri, $event)"
                        class="product-select"
                      >
                        <option [ngValue]="0" disabled>-- Selecciona un producto del catálogo --</option>
                        @for (catGroup of groupedProducts(); track catGroup.category) {
                          <optgroup [label]="catGroup.category">
                            @for (p of catGroup.items; track p.id) {
                              <option [ngValue]="p.id">{{ p.name }} ({{ formatCurrency(p.price) }})</option>
                            }
                          </optgroup>
                        }
                      </select>
                      <button type="button" class="btn btn-danger-ghost btn-sm" (click)="removeRewardProduct(ri)">✕</button>
                    </div>
                  }
                </div>
              }

              <!-- PRODUCTOS DEL COMBO PRECIO FIJO (Tipo 3) -->
              @if (promoForm.type === 'fixed_price_combo') {
                <div class="group-box">
                  <div class="oe-head">
                    <strong>Productos incluidos en el combo promocional:</strong>
                    <button type="button" class="btn btn-outline btn-sm" (click)="addComboItem()">
                      + Agregar producto
                    </button>
                  </div>

                  <div class="opt-col-labels">
                    <span>Producto</span>
                    <span class="extra-lbl">Cantidad</span>
                    <span></span>
                  </div>

                  @for (ci of promoForm.combo_items; track $index; let idx = $index) {
                    <div class="opt-edit-row">
                      <select
                        [ngModel]="ci.product_id"
                        (ngModelChange)="onComboProductChange(idx, $event)"
                        class="product-select"
                      >
                        <option [ngValue]="0" disabled>-- Selecciona un producto del catálogo --</option>
                        @for (catGroup of groupedProducts(); track catGroup.category) {
                          <optgroup [label]="catGroup.category">
                            @for (p of catGroup.items; track p.id) {
                              <option [ngValue]="p.id">{{ p.name }} ({{ formatCurrency(p.price) }})</option>
                            }
                          </optgroup>
                        }
                      </select>
                      <input type="number" min="1" [(ngModel)]="ci.quantity" class="extra-inp" />
                      <button type="button" class="btn btn-danger-ghost btn-sm" (click)="removeComboItem(idx)">✕</button>
                    </div>
                  }
                </div>
              }
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
      .promo-meta { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; display: block; margin-top: 0.15rem; }
    }
    .mb-xs { margin-bottom: 0.3rem; }
    .desc { margin: 0; font-size: 0.85rem; color: var(--text-secondary); }
    .groups-preview { display: flex; flex-direction: column; gap: 0.55rem; }
    .group-mini {
      background: var(--bg-canvas); border: 1px solid var(--border-light);
      border-radius: var(--radius-sm); padding: 0.55rem 0.7rem;
      .g-title { display: flex; gap: 0.4rem; align-items: center; font-size: 0.82rem; margin-bottom: 0.35rem; }
      span { color: var(--text-muted); }
      .price-inline { color: var(--brand-primary); font-weight: 800; }
    }
    .promo-highlight-val {
      background: var(--bg-green-soft); color: var(--brand-green);
      padding: 0.45rem 0.7rem; border-radius: var(--radius-sm); font-size: 0.9rem;
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
    .wide-modal { max-width: 740px; max-height: 90vh; display: flex; flex-direction: column; }
    .modal-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-light);
      h3 { margin: 0; }
    }
    .close-btn { border: none; background: transparent; font-size: 1.1rem; cursor: pointer; }
    .modal-scroll {
      padding: 1.1rem 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem;
    }
    .row-2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 0.75rem; @media (max-width: 580px) { grid-template-columns: 1fr; } }
    .row-3 { display: grid; grid-template-columns: 1.5fr 90px 120px; gap: 0.65rem; }
    .groups-editor { display: flex; flex-direction: column; gap: 0.75rem; }
    .ge-head { display: flex; justify-content: space-between; align-items: center; }
    .group-box {
      border: 1px solid var(--border-strong); border-radius: var(--radius-md);
      padding: 0.85rem; background: var(--bg-canvas); display: flex; flex-direction: column; gap: 0.65rem;
    }
    .opts-editor { display: flex; flex-direction: column; gap: 0.4rem; }
    .oe-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem; }
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
    .promo-type-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem;
      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }
    .ptype-btn {
      text-align: left; border: 1.5px solid var(--border-strong); background: #fff;
      border-radius: var(--radius-sm); padding: 0.6rem 0.75rem; cursor: pointer;
      display: flex; flex-direction: column; gap: 0.18rem;
      strong { font-size: 0.86rem; }
      small { font-size: 0.74rem; color: var(--text-muted); line-height: 1.25; }
      &.active { border-color: var(--brand-primary); background: var(--bg-accent-soft); }
    }
    .inline-disc-edit {
      display: flex; gap: 0.45rem;
      select { width: 145px; }
      input { flex: 1; }
    }
    .check-grid-box {
      display: flex; flex-direction: column; gap: 0.4rem;
      small { font-weight: 700; color: var(--text-secondary); }
    }
    .check-grid {
      display: flex; flex-wrap: wrap; gap: 0.4rem; max-height: 165px; overflow-y: auto;
    }
    .check-pill {
      display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; font-weight: 600;
      padding: 0.28rem 0.6rem; border-radius: 999px; border: 1px solid var(--border-strong);
      background: #fff; cursor: pointer;
      &.checked { background: var(--bg-accent-soft); border-color: var(--brand-primary); color: var(--brand-primary); }
    }
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
  promoForm: {
    name: string;
    description: string;
    type: PromotionType;
    target_scope: PromotionTargetScope;
    target_package_ids: number[];
    target_product_ids: number[];
    min_order_amount: number | null;
    min_quantity: number;
    max_quantity: number;
    reward_products: PromotionRewardProduct[];
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    fixed_price: number;
    combo_items: PromotionComboItem[];
  } = this.emptyPromoForm();

  ngOnInit(): void {
    this.loadAll();
  }

  private emptyPromoForm() {
    return {
      name: '',
      description: '',
      type: 'free_product' as PromotionType,
      target_scope: 'all_packages' as PromotionTargetScope,
      target_package_ids: [] as number[],
      target_product_ids: [] as number[],
      min_order_amount: 500,
      min_quantity: 1,
      max_quantity: 5,
      reward_products: [] as PromotionRewardProduct[],
      discount_type: 'percent' as 'percent' | 'fixed',
      discount_value: 5,
      fixed_price: 250,
      combo_items: [] as PromotionComboItem[],
    };
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

  promoTypeLabel(type: PromotionType): string {
    if (type === 'discount') return '💸 Descuento $ / %';
    if (type === 'fixed_price_combo') return '📦 Combo Precio Fijo';
    return '🎁 Producto Gratis';
  }

  promoScopeSummary(promo: Promotion): string {
    if (promo.type === 'fixed_price_combo') {
      return `Combo directo · ${promo.combo_items?.length || 0} producto(s)`;
    }
    if (promo.target_scope === 'all_packages') return 'Aplica en cualquier paquete';
    if (promo.target_scope === 'packages') {
      return `Aplica en ${promo.target_package_ids?.length || 0} paquete(s) específico(s)`;
    }
    if (promo.target_scope === 'products') {
      return `Aplica en ${promo.target_product_ids?.length || 0} producto(s) específico(s)`;
    }
    return `Aplica en pedidos desde ${this.formatCurrency(promo.min_order_amount || 0)}`;
  }

  // Package CRUD
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
          options: [{ product_id: null, label: '', extra_price: 0, is_active: true }],
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

  // Promotions CRUD (3 types)
  openNewPromo(): void {
    this.editingPromo.set(null);
    this.promoForm = this.emptyPromoForm();
    this.promoForm.reward_products = [{ product_id: 0, label: '' }];
    this.promoForm.combo_items = [{ product_id: 0, label: '', quantity: 1 }];
    this.showPromoModal.set(true);
  }

  openEditPromo(promo: Promotion): void {
    this.editingPromo.set(promo);
    this.promoForm = {
      name: promo.name,
      description: promo.description ?? '',
      type: promo.type || 'free_product',
      target_scope: promo.target_scope || 'all_packages',
      target_package_ids: [...(promo.target_package_ids ?? [])],
      target_product_ids: [...(promo.target_product_ids ?? [])],
      min_order_amount: promo.min_order_amount ?? 500,
      min_quantity: promo.min_quantity ?? 1,
      max_quantity: promo.max_quantity ?? 5,
      reward_products: (promo.reward_products ?? []).map((r) => ({ ...r })),
      discount_type: promo.discount_type ?? 'percent',
      discount_value: promo.discount_value ?? 5,
      fixed_price: promo.fixed_price ?? 250,
      combo_items: (promo.combo_items ?? []).map((c) => ({ ...c })),
    };
    if (this.promoForm.reward_products.length === 0) {
      this.promoForm.reward_products = [{ product_id: 0, label: '' }];
    }
    if (this.promoForm.combo_items.length === 0) {
      this.promoForm.combo_items = [{ product_id: 0, label: '', quantity: 1 }];
    }
    this.showPromoModal.set(true);
  }

  isTargetPackageSelected(pkgId: number): boolean {
    return this.promoForm.target_package_ids.includes(pkgId);
  }

  toggleTargetPackage(pkgId: number): void {
    if (this.isTargetPackageSelected(pkgId)) {
      this.promoForm.target_package_ids = this.promoForm.target_package_ids.filter((id) => id !== pkgId);
    } else {
      this.promoForm.target_package_ids = [...this.promoForm.target_package_ids, pkgId];
    }
  }

  isTargetProductSelected(prodId: number): boolean {
    return this.promoForm.target_product_ids.includes(prodId);
  }

  toggleTargetProduct(prodId: number): void {
    if (this.isTargetProductSelected(prodId)) {
      this.promoForm.target_product_ids = this.promoForm.target_product_ids.filter((id) => id !== prodId);
    } else {
      this.promoForm.target_product_ids = [...this.promoForm.target_product_ids, prodId];
    }
  }

  addRewardProduct(): void {
    this.promoForm.reward_products.push({ product_id: 0, label: '' });
  }

  removeRewardProduct(index: number): void {
    this.promoForm.reward_products.splice(index, 1);
  }

  onRewardProductChange(index: number, productId: number): void {
    const id = Number(productId);
    const prod = this.products().find((p) => p.id === id);
    this.promoForm.reward_products[index] = {
      product_id: prod ? prod.id : 0,
      label: prod ? prod.name : '',
    };
  }

  addComboItem(): void {
    this.promoForm.combo_items.push({ product_id: 0, label: '', quantity: 1 });
  }

  removeComboItem(index: number): void {
    this.promoForm.combo_items.splice(index, 1);
  }

  onComboProductChange(index: number, productId: number): void {
    const id = Number(productId);
    const prod = this.products().find((p) => p.id === id);
    const item = this.promoForm.combo_items[index];
    item.product_id = prod ? prod.id : 0;
    item.label = prod ? prod.name : '';
  }

  savePromo(): void {
    if (!this.promoForm.name.trim()) {
      this.toast.error('Ingresa el nombre de la promoción.');
      return;
    }

    if (this.promoForm.type !== 'fixed_price_combo') {
      if (this.promoForm.target_scope === 'packages' && this.promoForm.target_package_ids.length === 0) {
        this.toast.error('Selecciona al menos un paquete al que aplique la promoción.');
        return;
      }
      if (this.promoForm.target_scope === 'products' && this.promoForm.target_product_ids.length === 0) {
        this.toast.error('Selecciona al menos un producto al que aplique la promoción.');
        return;
      }
    }

    const validRewards = this.promoForm.reward_products.filter((r) => r.product_id > 0);
    if (this.promoForm.type === 'free_product' && validRewards.length === 0) {
      this.toast.error('Selecciona al menos un producto del catálogo para regalar.');
      return;
    }

    const validCombo = this.promoForm.combo_items.filter((c) => c.product_id > 0 && c.quantity > 0);
    if (this.promoForm.type === 'fixed_price_combo' && validCombo.length === 0) {
      this.toast.error('Agrega al menos un producto del catálogo al combo promocional.');
      return;
    }

    const payload: Partial<Promotion> = {
      name: this.promoForm.name.trim(),
      description: this.promoForm.description.trim() || null,
      type: this.promoForm.type,
      target_scope: this.promoForm.target_scope,
      target_package_ids: this.promoForm.target_scope === 'packages' ? this.promoForm.target_package_ids : null,
      target_product_ids: this.promoForm.target_scope === 'products' ? this.promoForm.target_product_ids : null,
      min_order_amount: this.promoForm.target_scope === 'order_total' ? (this.promoForm.min_order_amount ?? 0) : null,
      min_quantity: Math.max(1, Number(this.promoForm.min_quantity) || 1),
      max_quantity: Math.max(1, Number(this.promoForm.max_quantity) || 1),
      reward_products: this.promoForm.type === 'free_product' ? validRewards : null,
      discount_type: this.promoForm.type === 'discount' ? this.promoForm.discount_type : null,
      discount_value: this.promoForm.type === 'discount' ? Number(this.promoForm.discount_value || 0) : null,
      fixed_price: this.promoForm.type === 'fixed_price_combo' ? Number(this.promoForm.fixed_price || 0) : null,
      combo_items: this.promoForm.type === 'fixed_price_combo' ? validCombo : null,
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
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'No se pudo guardar la promoción.');
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
