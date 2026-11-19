import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MealPackage,
  PackageGroup,
  PackageGroupOption,
  PackageSelectionItem,
} from '../../core/models/api.models';

export interface ConfiguredPackageResult {
  package: MealPackage;
  selections: PackageSelectionItem[];
  unitPrice: number;
  extrasCost: number;
}

@Component({
  selector: 'app-package-builder-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="cancelled.emit()">
      <div class="modal-panel pkg-modal" (click)="$event.stopPropagation()">
        <div class="pkg-head">
          <div>
            <h3>📦 {{ pkg.name }}</h3>
            @if (pkg.description) {
              <p>{{ pkg.description }}</p>
            }
          </div>
          <button type="button" class="close-btn" (click)="cancelled.emit()">✕</button>
        </div>

        <div class="pkg-body">
          @for (group of pkg.groups; track group.id ?? $index) {
            <section class="group-card">
              <div class="group-top">
                <div>
                  <strong>{{ group.name }}</strong>
                  <small>
                    @if (group.min_quantity > 0) {
                      Mínimo {{ group.min_quantity }} ·
                    }
                    Hasta {{ group.max_quantity }} unidad(es)
                  </small>
                </div>
                <span
                  class="counter-pill"
                  [class.over]="groupSelectedCount(group) > group.max_quantity"
                  [class.ok]="groupSelectedCount(group) >= group.min_quantity && groupSelectedCount(group) <= group.max_quantity && groupSelectedCount(group) > 0"
                >
                  {{ groupSelectedCount(group) }} / {{ group.max_quantity }}
                </span>
              </div>

              <div class="options-list">
                @for (opt of activeOptions(group); track opt.id ?? $index) {
                  <div class="option-row">
                    <div class="opt-info">
                      <span class="opt-label">{{ opt.label }}</span>
                      @if (opt.extra_price > 0) {
                        <span class="extra-badge">+{{ formatCurrency(opt.extra_price) }} c/u</span>
                      } @else {
                        <span class="included-badge">Incluido</span>
                      }
                    </div>

                    <div class="opt-controls">
                      <button
                        type="button"
                        class="btn-step"
                        (click)="adjustQty(group, opt, -1)"
                        [disabled]="getQty(group, opt) <= 0"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        class="qty-input"
                        min="0"
                        [max]="group.max_quantity"
                        [ngModel]="getQty(group, opt)"
                        (ngModelChange)="setQty(group, opt, $event)"
                      />
                      <button
                        type="button"
                        class="btn-step"
                        (click)="adjustQty(group, opt, 1)"
                        [disabled]="groupRemaining(group) <= 0"
                      >
                        +
                      </button>
                      @if (group.max_quantity >= 20) {
                        <button
                          type="button"
                          class="btn-quick"
                          (click)="adjustQty(group, opt, 10)"
                          [disabled]="groupRemaining(group) <= 0"
                        >
                          +10
                        </button>
                      }
                      <button
                        type="button"
                        class="btn-quick fill"
                        (click)="fillRemaining(group, opt)"
                        [disabled]="groupRemaining(group) <= 0"
                        title="Asignar lo que falta del grupo aquí"
                      >
                        Restante ({{ groupRemaining(group) }})
                      </button>
                    </div>
                  </div>
                }
              </div>
            </section>
          }

          @if (errorMsg()) {
            <div class="alert alert-error">{{ errorMsg() }}</div>
          }
        </div>

        <div class="pkg-foot">
          <div class="price-summary">
            <div>Base: {{ formatCurrency(pkg.base_price) }}</div>
            @if (extrasTotal > 0) {
              <div class="extras-line">Suplementos (ej. Requesón): +{{ formatCurrency(extrasTotal) }}</div>
            }
            <strong class="final-price">Total paquete: {{ formatCurrency(pkg.base_price + extrasTotal) }}</strong>
          </div>

          <div class="foot-actions">
            <button type="button" class="btn btn-outline" (click)="cancelled.emit()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="confirm()">
              ✅ Agregar Paquete
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pkg-modal { max-width: 680px; max-height: 90vh; display: flex; flex-direction: column; }
    .pkg-head {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;
      padding: 1.1rem 1.3rem; border-bottom: 1px solid var(--border-light);
      h3 { margin: 0; font-size: 1.15rem; }
      p { margin: 0.25rem 0 0; font-size: 0.84rem; color: var(--text-secondary); }
    }
    .close-btn {
      border: none; background: transparent; font-size: 1.1rem; cursor: pointer;
      color: var(--text-muted); padding: 0.2rem 0.4rem;
    }
    .pkg-body {
      padding: 1.1rem 1.3rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.9rem;
    }
    .group-card {
      border: 1px solid var(--border-light); border-radius: var(--radius-md);
      padding: 0.85rem 0.95rem; background: var(--bg-canvas);
      display: flex; flex-direction: column; gap: 0.65rem;
    }
    .group-top {
      display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap;
      strong { display: block; font-size: 0.95rem; }
      small { color: var(--text-secondary); font-size: 0.78rem; }
    }
    .counter-pill {
      padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.78rem; font-weight: 800;
      background: var(--bg-subtle); color: var(--text-secondary);
      &.ok { background: var(--bg-green-soft); color: var(--brand-green); }
      &.over { background: #fef2f2; color: #dc2626; }
    }
    .options-list { display: flex; flex-direction: column; gap: 0.45rem; }
    .option-row {
      display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap;
      background: #fff; border: 1px solid var(--border-light); border-radius: var(--radius-sm);
      padding: 0.5rem 0.65rem;
    }
    .opt-info {
      display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;
      .opt-label { font-weight: 700; font-size: 0.86rem; }
      .extra-badge {
        font-size: 0.72rem; font-weight: 700; padding: 0.14rem 0.48rem;
        border-radius: 999px; background: var(--bg-gold-soft); color: #92400e;
      }
      .included-badge {
        font-size: 0.72rem; font-weight: 600; color: var(--text-muted);
      }
    }
    .opt-controls {
      display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;
    }
    .btn-step {
      width: 28px; height: 28px; border: 1px solid var(--border-strong);
      border-radius: 6px; background: #fff; font-weight: 800; cursor: pointer;
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }
    .qty-input {
      width: 62px; text-align: center; padding: 0.28rem 0.35rem;
      border: 1px solid var(--border-strong); border-radius: 6px; font-weight: 700;
    }
    .btn-quick {
      border: 1px solid var(--border-strong); background: var(--bg-subtle);
      border-radius: 6px; padding: 0.28rem 0.5rem; font-size: 0.74rem; font-weight: 700; cursor: pointer;
      &.fill { background: var(--bg-accent-soft); border-color: #f4b7a3; color: var(--brand-primary); }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }
    .pkg-foot {
      padding: 0.95rem 1.3rem; border-top: 1px solid var(--border-light); background: #fff;
      display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap;
    }
    .price-summary {
      font-size: 0.82rem; color: var(--text-secondary);
      .extras-line { color: #9a5406; font-weight: 700; }
      .final-price { display: block; font-size: 1.08rem; color: var(--brand-primary); margin-top: 0.15rem; }
    }
    .foot-actions { display: flex; gap: 0.55rem; }
  `],
})
export class PackageBuilderModalComponent implements OnInit {
  @Input({ required: true }) pkg!: MealPackage;
  @Output() confirmed = new EventEmitter<ConfiguredPackageResult>();
  @Output() cancelled = new EventEmitter<void>();

  readonly errorMsg = signal<string | null>(null);
  private quantities: Record<string, number> = {};

  ngOnInit(): void {
    // Auto-fill single-option groups (like Desechables incluidos)
    for (const g of this.pkg.groups) {
      const opts = this.activeOptions(g);
      if (opts.length === 1 && g.max_quantity === 1) {
        this.quantities[this.key(g, opts[0])] = 1;
      }
    }
  }

  activeOptions(group: PackageGroup): PackageGroupOption[] {
    return (group.options ?? []).filter((o) => o.is_active !== false);
  }

  private key(group: PackageGroup, opt: PackageGroupOption): string {
    return `${group.id ?? group.name}::${opt.id ?? opt.label}`;
  }

  getQty(group: PackageGroup, opt: PackageGroupOption): number {
    return this.quantities[this.key(group, opt)] ?? 0;
  }

  setQty(group: PackageGroup, opt: PackageGroupOption, rawVal: number | string): void {
    const parsed = Math.max(0, Math.floor(Number(rawVal) || 0));
    const currentOpt = this.getQty(group, opt);
    const otherTotal = this.groupSelectedCount(group) - currentOpt;
    const maxAllowedForOpt = Math.max(0, group.max_quantity - otherTotal);
    this.quantities[this.key(group, opt)] = Math.min(parsed, maxAllowedForOpt);
    this.errorMsg.set(null);
  }

  adjustQty(group: PackageGroup, opt: PackageGroupOption, delta: number): void {
    this.setQty(group, opt, this.getQty(group, opt) + delta);
  }

  fillRemaining(group: PackageGroup, opt: PackageGroupOption): void {
    const rem = this.groupRemaining(group);
    if (rem > 0) {
      this.setQty(group, opt, this.getQty(group, opt) + rem);
    }
  }

  groupSelectedCount(group: PackageGroup): number {
    return this.activeOptions(group).reduce((sum, opt) => sum + this.getQty(group, opt), 0);
  }

  groupRemaining(group: PackageGroup): number {
    return Math.max(0, group.max_quantity - this.groupSelectedCount(group));
  }

  get extrasTotal(): number {
    let total = 0;
    for (const group of this.pkg.groups) {
      for (const opt of this.activeOptions(group)) {
        total += this.getQty(group, opt) * (opt.extra_price || 0);
      }
    }
    return Number(total.toFixed(2));
  }

  confirm(): void {
    this.errorMsg.set(null);
    const selections: PackageSelectionItem[] = [];

    for (const group of this.pkg.groups) {
      const count = this.groupSelectedCount(group);
      if (count < group.min_quantity) {
        this.errorMsg.set(
          `En "${group.name}" debes elegir al menos ${group.min_quantity} unidad(es).`
        );
        return;
      }
      if (count > group.max_quantity) {
        this.errorMsg.set(
          `En "${group.name}" el máximo permitido es ${group.max_quantity}.`
        );
        return;
      }

      for (const opt of this.activeOptions(group)) {
        const qty = this.getQty(group, opt);
        if (qty > 0) {
          selections.push({
            group_id: group.id ?? null,
            option_id: opt.id ?? null,
            group: group.name,
            label: opt.label,
            quantity: qty,
            extra_price: opt.extra_price || 0,
          });
        }
      }
    }

    if (selections.length === 0) {
      this.errorMsg.set('Elige al menos un producto dentro del paquete.');
      return;
    }

    const extras = this.extrasTotal;
    this.confirmed.emit({
      package: this.pkg,
      selections,
      unitPrice: Number((this.pkg.base_price + extras).toFixed(2)),
      extrasCost: extras,
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount ?? 0);
  }
}
