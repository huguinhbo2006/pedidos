import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Customer,
  CustomerAddress,
  MealPackage,
  PackageSelectionItem,
  Product,
  Promotion,
} from '../../core/models/api.models';
import {
  GoogleMapsAddressInputComponent,
  SelectedAddressPayload,
} from '../../shared/google-maps-address-input/google-maps-address-input.component';
import {
  ConfiguredPackageResult,
  PackageBuilderModalComponent,
} from '../../shared/package-builder-modal/package-builder-modal.component';

interface CartLine {
  uid: string;
  item_type: 'product' | 'package' | 'promo_combo' | 'promo_custom';
  product_id: number | null;
  package_id: number | null;
  promotion_id?: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  is_promo: boolean;
  promo_reason: string;
  package_details?: PackageSelectionItem[] | null;
}

interface PromoRewardChoice {
  key: string;
  product_id: number | null;
  label: string;
}

@Component({
  selector: 'app-new-order',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    GoogleMapsAddressInputComponent,
    PackageBuilderModalComponent,
  ],
  templateUrl: './new-order.component.html',
  styleUrl: './new-order.component.scss',
})
export class NewOrderComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly editOrderId = signal<number | null>(null);
  readonly editingOrderNumber = signal<string | null>(null);

  readonly todayIso = this.computeIsoDate(0);
  readonly tomorrowIso = this.computeIsoDate(1);
  readonly deliveryDate = signal<string>(this.computeIsoDate(0));

  // Customer fields
  customerPhone = '';
  customerName = '';
  private lastAutoFilledName: string | null = null;
  private lastMatchedPhone: string | null = null;

  readonly phoneSearching = signal(false);
  readonly foundCustomer = signal<Customer | null>(null);
  readonly phoneSuggestions = signal<Array<{ id: number; phone: string; name: string; addresses_count: number }>>([]);

  // Address fields
  readonly selectedAddressId = signal<number | null>(null);
  readonly useNewAddress = signal(true);
  newAddressText = '';
  newAddressReferences = '';
  newAddressLabel = '';
  newAddressPlaceId: string | null = null;
  newAddressLat: number | null = null;
  newAddressLng: number | null = null;
  savedAddressReferences = '';

  // Delivery time & Order notes
  readonly deliveryTimeMode = signal<'asap' | 'scheduled'>('asap');
  readonly scheduledDeliveryTime = signal<string>('');
  orderNotes = '';

  // Catalog, Packages & Promotions
  readonly catalogMode = signal<'packages' | 'combos' | 'products'>('packages');
  readonly products = signal<Product[]>([]);
  readonly packages = signal<MealPackage[]>([]);
  readonly promotions = signal<Promotion[]>([]);
  readonly loadingProducts = signal(true);
  readonly selectedCategory = signal<string>('Todos');
  productSearch = '';

  // Package builder modal & promotion states
  readonly buildingPackage = signal<MealPackage | null>(null);
  promoGiftCounts: Record<string, number> = {};
  readonly selectedDiscountPromoIds = signal<number[]>([]);

  // Manual discount
  readonly manualDiscountType = signal<'fixed' | 'percent' | null>(null);
  readonly manualDiscountValue = signal<number>(0);
  readonly manualDiscountReason = signal<string>('');

  // Cart & custom promo
  readonly cart = signal<CartLine[]>([]);
  showCustomPromoBox = false;
  customPromoName = '';
  customPromoQty = 1;
  customPromoReason = 'Regalo / Promoción';

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly currentStep = signal<1 | 2 | 3>(1);
  readonly stepError = signal<string | null>(null);
  readonly pendingPromoConfirmOpen = signal(false);

  private pendingOpenPdf = false;
  private readonly notifiedPromoIds = new Set<number>();
  private uidCounter = 1;
  private readonly phoneInput$ = new Subject<string>();
  private sub?: Subscription;

  private readonly promoWatcher = effect(() => {
    const freeQual = this.qualifyingFreePromotions();
    const discQual = this.qualifyingDiscountPromotions();
    const currentIds = new Set<number>([
      ...freeQual.map((p) => p.id),
      ...discQual.map((q) => q.promo.id),
    ]);

    for (const prevId of Array.from(this.notifiedPromoIds)) {
      if (!currentIds.has(prevId)) {
        this.notifiedPromoIds.delete(prevId);
      }
    }

    for (const promo of freeQual) {
      if (!this.notifiedPromoIds.has(promo.id)) {
        this.notifiedPromoIds.add(promo.id);
        if (!this.hasAppliedFreePromo(promo)) {
          this.toast.success(
            `🎁 ¡Promo disponible! "${promo.name}" — Ya puedes agregar el regalo gratis.`
          );
        }
      }
    }

    for (const q of discQual) {
      if (!this.notifiedPromoIds.has(q.promo.id)) {
        this.notifiedPromoIds.add(q.promo.id);
        if (!this.isDiscountPromoSelected(q.promo.id)) {
          this.toast.success(
            `💸 ¡Promo desbloqueada! "${q.promo.name}" (−${this.formatCurrency(q.discount)}) — Actívala en el resumen.`
          );
        }
      }
    }
  });

  readonly categories = computed(() => {
    const set = new Set(this.products().map((p) => p.category));
    return ['Todos', ...Array.from(set)];
  });

  readonly filteredProducts = computed(() => {
    const cat = this.selectedCategory();
    const term = this.productSearch.trim().toLowerCase();
    return this.products().filter((p) => {
      const matchCat = cat === 'Todos' || p.category === cat;
      const matchTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term);
      return matchCat && matchTerm;
    });
  });

  readonly activePromotions = computed(() =>
    this.promotions().filter((p) => p.is_active)
  );

  readonly comboPromotions = computed(() =>
    this.promotions().filter((p) => p.is_active && p.type === 'fixed_price_combo')
  );

  readonly qualifyingFreePromotions = computed(() =>
    this.promotions().filter(
      (p) => p.is_active && p.type === 'free_product' && this.evalPromoScope(p).qualifies
    )
  );

  readonly unclaimedFreePromotions = computed(() =>
    this.qualifyingFreePromotions().filter((p) => !this.hasAppliedFreePromo(p))
  );

  readonly qualifyingDiscountPromotions = computed(() =>
    this.promotions()
      .filter((p) => p.is_active && p.type === 'discount')
      .map((promo) => {
        const { qualifies, qualifyingBase } = this.evalPromoScope(promo);
        if (!qualifies) return null;
        const val = Math.max(0, Number(promo.discount_value ?? 0));
        const discount =
          promo.discount_type === 'percent'
            ? Number((qualifyingBase * (Math.min(100, val) / 100)).toFixed(2))
            : Math.min(qualifyingBase, Number(val.toFixed(2)));
        return discount > 0 ? { promo, discount } : null;
      })
      .filter((x): x is { promo: Promotion; discount: number } => x !== null)
  );

  readonly selectedQualifyingDiscounts = computed(() =>
    this.qualifyingDiscountPromotions().filter((q) =>
      this.selectedDiscountPromoIds().includes(q.promo.id)
    )
  );

  readonly unappliedDiscountPromotions = computed(() =>
    this.qualifyingDiscountPromotions().filter(
      (q) => !this.isDiscountPromoSelected(q.promo.id)
    )
  );

  readonly hasUnappliedQualifyingPromos = computed(
    () =>
      this.unclaimedFreePromotions().length > 0 ||
      this.unappliedDiscountPromotions().length > 0
  );

  readonly promoDiscountTotal = computed(() =>
    Math.min(
      this.orderSubtotal(),
      Number(this.selectedQualifyingDiscounts().reduce((s, q) => s + q.discount, 0).toFixed(2))
    )
  );

  readonly manualDiscountAmount = computed(() => {
    const remaining = Math.max(0, Number((this.orderSubtotal() - this.promoDiscountTotal()).toFixed(2)));
    const type = this.manualDiscountType();
    const val = Math.max(0, Number(this.manualDiscountValue()) || 0);
    if (!type || val <= 0 || remaining <= 0) return 0;
    if (type === 'percent') {
      return Number((remaining * (Math.min(100, val) / 100)).toFixed(2));
    }
    return Math.min(remaining, Number(val.toFixed(2)));
  });

  readonly totalPaidItems = computed(() =>
    this.cart()
      .filter((l) => !l.is_promo)
      .reduce((sum, l) => sum + l.quantity, 0)
  );

  readonly totalFreeItems = computed(() =>
    this.cart()
      .filter((l) => l.is_promo)
      .reduce((sum, l) => sum + l.quantity, 0)
  );

  readonly orderSubtotal = computed(() =>
    Number(
      this.cart()
        .reduce((sum, l) => sum + (l.is_promo ? 0 : l.unit_price * l.quantity), 0)
        .toFixed(2)
    )
  );

  readonly finalOrderTotal = computed(() =>
    Math.max(
      0,
      Number((this.orderSubtotal() - this.promoDiscountTotal() - this.manualDiscountAmount()).toFixed(2))
    )
  );

  readonly promoSavings = computed(() =>
    Number(
      this.cart()
        .filter((l) => l.is_promo)
        .reduce((sum, l) => sum + l.unit_price * l.quantity, 0)
        .toFixed(2)
    )
  );

  readonly selectedSavedAddress = computed<CustomerAddress | null>(() => {
    const id = this.selectedAddressId();
    const cust = this.foundCustomer();
    if (!id || !cust?.addresses) return null;
    return cust.addresses.find((a) => a.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loadCatalog();

    const paramId = this.route.snapshot.paramMap.get('id');
    if (paramId) {
      const id = Number(paramId);
      if (!isNaN(id) && id > 0) {
        this.editOrderId.set(id);
        this.loadOrderForEditing(id);
      }
    }

    this.sub = this.phoneInput$
      .pipe(
        debounceTime(260),
        distinctUntilChanged(),
        tap((raw) => {
          const digits = raw.replace(/\D+/g, '');
          if (digits.length < 3) {
            this.phoneSearching.set(false);
            this.phoneSuggestions.set([]);
            if (this.foundCustomer()) {
              this.resetMatchedCustomer();
            }
          } else {
            this.phoneSearching.set(true);
          }
        }),
        switchMap((raw) => {
          const digits = raw.replace(/\D+/g, '');
          if (digits.length < 3) {
            return of(null);
          }
          return this.api.lookupCustomerByPhone(raw);
        })
      )
      .subscribe({
        next: (res) => {
          this.phoneSearching.set(false);
          if (!res) return;

          if (res.found && res.customer) {
            this.applyMatchedCustomer(res.customer);
            this.phoneSuggestions.set([]);
          } else {
            if (this.foundCustomer() && this.lastMatchedPhone !== res.normalized_phone) {
              this.resetMatchedCustomer();
            }
            this.phoneSuggestions.set(res.suggestions ?? []);
          }
        },
        error: () => {
          this.phoneSearching.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  loadCatalog(): void {
    this.loadingProducts.set(true);
    this.api.getProducts({ active_only: true }).subscribe({
      next: (list) => {
        this.products.set(list);
        this.loadingProducts.set(false);
      },
      error: () => {
        this.loadingProducts.set(false);
        this.toast.error('No se pudo cargar el catálogo de productos.');
      },
    });
    this.api.getPackages(true).subscribe({
      next: (list) => {
        this.packages.set(list);
        if (list.length === 0) {
          this.catalogMode.set('products');
        }
      },
    });
    this.api.getPromotions(true).subscribe({
      next: (list) => this.promotions.set(list),
    });
  }

  onPhoneChange(value: string): void {
    this.customerPhone = value;
    this.phoneInput$.next(value);
  }

  get hasValidPhoneLength(): boolean {
    return this.customerPhone.replace(/\D+/g, '').length >= 7;
  }

  get isStep1Valid(): boolean {
    return this.hasValidPhoneLength && this.customerName.trim().length >= 2;
  }

  get activeDeliveryAddress(): string {
    const saved = this.selectedSavedAddress();
    const usingSaved = !this.useNewAddress() && saved !== null;
    return usingSaved ? saved.address : this.newAddressText.trim();
  }

  get activeDeliveryReferences(): string {
    const saved = this.selectedSavedAddress();
    const usingSaved = !this.useNewAddress() && saved !== null;
    return usingSaved ? this.savedAddressReferences.trim() : this.newAddressReferences.trim();
  }

  get activeDeliveryTimeLabel(): string {
    if (this.deliveryTimeMode() === 'asap') {
      return 'Lo antes posible';
    }
    const raw = this.scheduledDeliveryTime().trim();
    return raw ? this.formatDeliveryTime(raw) : 'Hora por definir';
  }

  readonly formattedDeliveryDate = computed(() => {
    const val = this.deliveryDate();
    if (!val) return 'Hoy';
    if (val === this.todayIso) return 'Hoy';
    if (val === this.tomorrowIso) return 'Mañana';
    const parts = val.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  });

  setDeliveryDate(dateStr: string): void {
    if (!dateStr) return;
    this.deliveryDate.set(dateStr);
    if (dateStr > this.todayIso && this.deliveryTimeMode() === 'asap') {
      this.deliveryTimeMode.set('scheduled');
      if (!this.scheduledDeliveryTime()) {
        this.scheduledDeliveryTime.set('14:00');
      }
    }
  }

  loadOrderForEditing(id: number): void {
    this.api.getOrder(id).subscribe({
      next: (order) => {
        this.editingOrderNumber.set(order.order_number);
        this.customerPhone = order.customer_phone;
        this.customerName = order.customer_name;
        if (order.delivery_date) {
          this.deliveryDate.set(order.delivery_date.substring(0, 10));
        }
        if (order.delivery_time && order.delivery_time !== 'Lo antes posible') {
          this.deliveryTimeMode.set('scheduled');
          this.scheduledDeliveryTime.set(order.delivery_time);
        } else {
          this.deliveryTimeMode.set('asap');
        }

        this.useNewAddress.set(false);
        this.newAddressText = order.delivery_address;
        this.newAddressReferences = order.delivery_references || '';
        this.newAddressPlaceId = order.delivery_place_id;
        this.newAddressLat = order.delivery_lat;
        this.newAddressLng = order.delivery_lng;
        this.selectedAddressId.set(order.customer_address_id);
        this.savedAddressReferences = order.delivery_references || '';
        this.orderNotes = order.notes || '';

        if (order.manual_discount_type) {
          this.manualDiscountType.set(order.manual_discount_type);
          this.manualDiscountValue.set(order.manual_discount_value || 0);
          this.manualDiscountReason.set(order.manual_discount_reason || '');
        }

        if (order.applied_promotions?.length) {
          this.selectedDiscountPromoIds.set(order.applied_promotions.map((p) => p.promotion_id));
        }

        if (order.items?.length) {
          const lines: CartLine[] = order.items.map((item) => ({
            uid: `line_${this.uidCounter++}`,
            item_type: (item.item_type as any) || (item.package_id ? 'package' : item.product_id ? 'product' : 'promo_custom'),
            product_id: item.product_id,
            package_id: item.package_id || null,
            promotion_id: item.promotion_id || null,
            product_name: item.product_name,
            unit_price: Number(item.unit_price) || 0,
            quantity: item.quantity,
            is_promo: item.is_promo,
            promo_reason: item.promo_reason || '',
            package_details: item.package_details || null,
          }));
          this.cart.set(lines);
        }
      },
      error: () => {
        this.toast.error('No se pudo cargar el pedido para edición.');
        void this.router.navigate(['/pedidos']);
      },
    });
  }

  setDeliveryTimeMode(mode: 'asap' | 'scheduled'): void {
    this.deliveryTimeMode.set(mode);
    if (mode === 'scheduled' && !this.scheduledDeliveryTime().trim()) {
      this.scheduledDeliveryTime.set(this.computeOffsetHHMM(45));
    }
  }

  setQuickDeliveryOffset(minutes: number): void {
    this.deliveryTimeMode.set('scheduled');
    this.scheduledDeliveryTime.set(this.computeOffsetHHMM(minutes));
  }

  private computeOffsetHHMM(minutes: number): string {
    const dt = new Date(Date.now() + minutes * 60_000);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private computeIsoDate(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  get isStep2Valid(): boolean {
    return this.activeDeliveryAddress.length >= 4;
  }

  goToStep(target: 1 | 2 | 3): void {
    this.stepError.set(null);
    this.formError.set(null);

    if (target <= this.currentStep()) {
      this.currentStep.set(target);
      return;
    }

    if (target >= 2 && !this.isStep1Valid) {
      this.currentStep.set(1);
      this.stepError.set('Completa el celular (mínimo 7 dígitos) y el nombre del cliente para continuar.');
      return;
    }

    if (target === 3 && !this.isStep2Valid) {
      this.currentStep.set(2);
      this.stepError.set('Selecciona un domicilio guardado o busca el domicilio de entrega para continuar.');
      return;
    }

    this.currentStep.set(target);
  }

  nextStep(): void {
    const step = this.currentStep();
    if (step === 1) {
      this.goToStep(2);
    } else if (step === 2) {
      this.goToStep(3);
    }
  }

  prevStep(): void {
    this.stepError.set(null);
    const step = this.currentStep();
    if (step === 3) {
      this.currentStep.set(2);
    } else if (step === 2) {
      this.currentStep.set(1);
    }
  }

  pickSuggestedPhone(phone: string): void {
    this.customerPhone = phone;
    this.phoneSuggestions.set([]);
    this.phoneSearching.set(true);
    this.api.lookupCustomerByPhone(phone).subscribe({
      next: (res) => {
        this.phoneSearching.set(false);
        if (res.found && res.customer) {
          this.applyMatchedCustomer(res.customer);
        }
      },
      error: () => this.phoneSearching.set(false),
    });
  }

  private applyMatchedCustomer(customer: Customer): void {
    this.foundCustomer.set(customer);
    this.lastMatchedPhone = customer.phone;
    this.customerName = customer.name;
    this.lastAutoFilledName = customer.name;

    const addresses = customer.addresses ?? [];
    if (addresses.length > 0) {
      this.selectSavedAddress(addresses[0]);
    } else {
      this.selectedAddressId.set(null);
      this.useNewAddress.set(true);
    }
  }

  private resetMatchedCustomer(): void {
    this.foundCustomer.set(null);
    this.lastMatchedPhone = null;
    this.selectedAddressId.set(null);
    this.useNewAddress.set(true);
    if (this.lastAutoFilledName !== null && this.customerName === this.lastAutoFilledName) {
      this.customerName = '';
    }
    this.lastAutoFilledName = null;
  }

  selectSavedAddress(addr: CustomerAddress): void {
    this.selectedAddressId.set(addr.id);
    this.useNewAddress.set(false);
    this.savedAddressReferences = addr.references ?? '';
  }

  switchToNewAddress(): void {
    this.selectedAddressId.set(null);
    this.useNewAddress.set(true);
  }

  onGoogleAddressChange(payload: SelectedAddressPayload): void {
    this.newAddressText = payload.address;
    this.newAddressPlaceId = payload.place_id;
    this.newAddressLat = payload.latitude;
    this.newAddressLng = payload.longitude;
  }

  openPackageBuilder(pkg: MealPackage): void {
    this.buildingPackage.set(pkg);
  }

  onPackageConfigured(result: ConfiguredPackageResult): void {
    this.buildingPackage.set(null);
    this.cart.update((lines) => [
      ...lines,
      {
        uid: `line_${this.uidCounter++}`,
        item_type: 'package',
        product_id: null,
        package_id: result.package.id,
        product_name: result.package.name,
        unit_price: result.unitPrice,
        quantity: 1,
        is_promo: false,
        promo_reason: '',
        package_details: result.selections,
      },
    ]);
    this.toast.success(`${result.package.name} agregado al pedido.`);
  }

  private evalPromoScope(promo: Promotion): { qualifies: boolean; qualifyingBase: number } {
    const paidLines = this.cart().filter((l) => !l.is_promo);
    const minQty = Math.max(1, Number(promo.min_quantity ?? 1));
    const minAmount = Number(promo.min_order_amount ?? 0);
    const scope = promo.target_scope || 'all_packages';

    if (scope === 'all_packages') {
      const matching = paidLines.filter((l) => l.item_type === 'package');
      const qty = matching.reduce((s, l) => s + l.quantity, 0);
      const base = matching.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      return { qualifies: qty >= minQty && base >= minAmount, qualifyingBase: base };
    }

    if (scope === 'packages') {
      const ids = new Set((promo.target_package_ids ?? []).map(Number));
      const matching = paidLines.filter(
        (l) => l.item_type === 'package' && l.package_id !== null && ids.has(Number(l.package_id))
      );
      const qty = matching.reduce((s, l) => s + l.quantity, 0);
      const base = matching.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      return { qualifies: qty >= minQty && base >= minAmount, qualifyingBase: base };
    }

    if (scope === 'products') {
      const ids = new Set((promo.target_product_ids ?? []).map(Number));
      const matching = paidLines.filter(
        (l) => l.item_type === 'product' && l.product_id !== null && ids.has(Number(l.product_id))
      );
      const qty = matching.reduce((s, l) => s + l.quantity, 0);
      const base = matching.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      return { qualifies: qty >= minQty && base >= minAmount, qualifyingBase: base };
    }

    const sub = this.orderSubtotal();
    return { qualifies: sub > 0 && sub >= minAmount, qualifyingBase: sub };
  }

  getPromoRewardChoices(promo: Promotion): PromoRewardChoice[] {
    if (promo.reward_products?.length) {
      return promo.reward_products.map((r) => ({
        key: `p:${r.product_id}`,
        product_id: r.product_id,
        label: r.label,
      }));
    }
    return (promo.allowed_options ?? []).map((opt) => ({
      key: `o:${opt}`,
      product_id: null,
      label: opt,
    }));
  }

  getPromoOptQty(promoId: number, choiceKey: string): number {
    return this.promoGiftCounts[`${promoId}::${choiceKey}`] ?? 0;
  }

  promoTotalSelected(promo: Promotion): number {
    return this.getPromoRewardChoices(promo).reduce(
      (sum, ch) => sum + this.getPromoOptQty(promo.id, ch.key),
      0
    );
  }

  adjustPromoGift(promo: Promotion, choiceKey: string, delta: number): void {
    const key = `${promo.id}::${choiceKey}`;
    const current = this.promoGiftCounts[key] ?? 0;
    const otherTotal = this.promoTotalSelected(promo) - current;
    const maxForThis = Math.max(0, promo.max_quantity - otherTotal);
    this.promoGiftCounts[key] = Math.min(maxForThis, Math.max(0, current + delta));
  }

  fillPromoGift(promo: Promotion, choiceKey: string): void {
    for (const ch of this.getPromoRewardChoices(promo)) {
      this.promoGiftCounts[`${promo.id}::${ch.key}`] = ch.key === choiceKey ? promo.max_quantity : 0;
    }
  }

  applyFreeProductPromotion(promo: Promotion): void {
    const choices = this.getPromoRewardChoices(promo);
    const chosen = choices
      .map((ch) => ({ ...ch, qty: this.getPromoOptQty(promo.id, ch.key) }))
      .filter((x) => x.qty > 0);

    if (chosen.length === 0) {
      this.toast.error('Selecciona al menos 1 unidad del regalo promocional.');
      return;
    }

    const catalogMatched = chosen.filter((x) => x.product_id !== null);
    const customMatched = chosen.filter((x) => x.product_id === null);

    const newLines: CartLine[] = [];
    for (const item of catalogMatched) {
      const prod = this.products().find((p) => p.id === item.product_id);
      newLines.push({
        uid: `line_${this.uidCounter++}`,
        item_type: 'product',
        product_id: item.product_id,
        package_id: null,
        promotion_id: promo.id,
        product_name: item.label,
        unit_price: Number(prod?.price ?? 0),
        quantity: item.qty,
        is_promo: true,
        promo_reason: promo.name,
      });
    }

    if (customMatched.length > 0) {
      const summary = customMatched.map((x) => `${x.qty}x ${x.label}`).join(', ');
      newLines.push({
        uid: `line_${this.uidCounter++}`,
        item_type: 'promo_custom',
        product_id: null,
        package_id: null,
        promotion_id: promo.id,
        product_name: `Regalo: ${summary}`,
        unit_price: 0,
        quantity: 1,
        is_promo: true,
        promo_reason: promo.name,
      });
    }

    this.cart.update((lines) => [...lines, ...newLines]);
    for (const ch of choices) {
      this.promoGiftCounts[`${promo.id}::${ch.key}`] = 0;
    }
    this.toast.success(`Regalo "${promo.name}" agregado ($0.00).`);
  }

  hasAppliedFreePromo(promo: Promotion): boolean {
    const promoTitle = promo.name.trim().toLowerCase();
    return this.cart().some(
      (l) =>
        l.is_promo &&
        (l.promotion_id === promo.id || l.promo_reason.trim().toLowerCase() === promoTitle)
    );
  }

  isPromoQualified(promo: Promotion): boolean {
    if (promo.type === 'fixed_price_combo') return false;
    return this.evalPromoScope(promo).qualifies;
  }

  promoConditionLabel(promo: Promotion): string {
    if (promo.type === 'fixed_price_combo') {
      return `Combo precio fijo (${this.formatCurrency(promo.fixed_price ?? 0)})`;
    }
    const minQ = Math.max(1, Number(promo.min_quantity ?? 1));
    if (promo.target_scope === 'all_packages') {
      return minQ > 1 ? `Desde ${minQ} paquetes` : 'En compra de cualquier paquete';
    }
    if (promo.target_scope === 'packages') {
      return minQ > 1 ? `${minQ}+ paquetes seleccionados` : 'En paquetes seleccionados';
    }
    if (promo.target_scope === 'products') {
      return minQ > 1 ? `${minQ}+ productos seleccionados` : 'En productos seleccionados';
    }
    return `Compra mín. ${this.formatCurrency(promo.min_order_amount ?? 0)}`;
  }

  quickApplyFullReward(promo: Promotion, choice: PromoRewardChoice): void {
    this.fillPromoGift(promo, choice.key);
    this.applyFreeProductPromotion(promo);
  }

  focusPromotionsStep(): void {
    this.pendingPromoConfirmOpen.set(false);
    this.currentStep.set(3);
  }

  isDiscountPromoSelected(promoId: number): boolean {
    return this.selectedDiscountPromoIds().includes(promoId);
  }

  toggleDiscountPromo(promoId: number): void {
    this.selectedDiscountPromoIds.update((ids) =>
      ids.includes(promoId) ? ids.filter((id) => id !== promoId) : [...ids, promoId]
    );
  }

  addComboPromoToCart(promo: Promotion): void {
    const existing = this.cart().find(
      (item) => item.item_type === 'promo_combo' && item.promotion_id === promo.id && !item.is_promo
    );
    if (existing) {
      this.cart.update((lines) =>
        lines.map((l) => (l.uid === existing.uid ? { ...l, quantity: l.quantity + 1 } : l))
      );
      this.toast.success(`+1 ${promo.name}`);
      return;
    }

    this.cart.update((lines) => [
      ...lines,
      {
        uid: `line_${this.uidCounter++}`,
        item_type: 'promo_combo',
        product_id: null,
        package_id: null,
        promotion_id: promo.id,
        product_name: promo.name,
        unit_price: Number(promo.fixed_price ?? 0),
        quantity: 1,
        is_promo: false,
        promo_reason: '',
        package_details: (promo.combo_items ?? []).map((ci) => ({
          group: 'Combo Promoción',
          label: ci.label,
          quantity: ci.quantity,
          extra_price: 0,
        })),
      },
    ]);
    this.toast.success(`Combo "${promo.name}" agregado al pedido.`);
  }

  setManualDiscountType(type: 'fixed' | 'percent' | null): void {
    this.manualDiscountType.set(type);
    if (!type) {
      this.manualDiscountValue.set(0);
      this.manualDiscountReason.set('');
    }
  }

  onManualDiscountValueChange(raw: number | string): void {
    const num = Math.max(0, Number(raw) || 0);
    this.manualDiscountValue.set(this.manualDiscountType() === 'percent' ? Math.min(100, num) : num);
  }

  addProductToCart(product: Product, asPromo = false): void {
    const existing = this.cart().find(
      (item) =>
        item.item_type === 'product' &&
        item.product_id === product.id &&
        item.is_promo === asPromo
    );

    if (existing) {
      this.cart.update((lines) =>
        lines.map((l) => (l.uid === existing.uid ? { ...l, quantity: l.quantity + 1 } : l))
      );
      return;
    }

    this.cart.update((lines) => [
      ...lines,
      {
        uid: `line_${this.uidCounter++}`,
        item_type: 'product',
        product_id: product.id,
        package_id: null,
        product_name: product.name,
        unit_price: product.price,
        quantity: 1,
        is_promo: asPromo,
        promo_reason: asPromo ? 'Regalo / Promoción' : '',
      },
    ]);
  }

  addCustomPromoItem(): void {
    const name = this.customPromoName.trim();
    if (!name) {
      this.toast.error('Escribe el nombre del regalo / promoción.');
      return;
    }

    this.cart.update((lines) => [
      ...lines,
      {
        uid: `line_${this.uidCounter++}`,
        item_type: 'promo_custom',
        product_id: null,
        package_id: null,
        product_name: name,
        unit_price: 0,
        quantity: Math.max(1, Number(this.customPromoQty) || 1),
        is_promo: true,
        promo_reason: this.customPromoReason.trim() || 'Regalo / Promoción',
      },
    ]);

    this.customPromoName = '';
    this.customPromoQty = 1;
    this.customPromoReason = 'Regalo / Promoción';
    this.showCustomPromoBox = false;
  }

  changeQuantity(uid: string, delta: number): void {
    this.cart.update((lines) =>
      lines
        .map((l) => (l.uid === uid ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  toggleLinePromo(uid: string): void {
    this.cart.update((lines) =>
      lines.map((l) => {
        if (l.uid !== uid) return l;
        if (l.item_type === 'promo_custom') return l;
        const nextPromo = !l.is_promo;
        return {
          ...l,
          is_promo: nextPromo,
          promo_reason: nextPromo ? l.promo_reason || 'Regalo / Promoción' : '',
        };
      })
    );
  }

  updatePromoReason(uid: string, reason: string): void {
    this.cart.update((lines) =>
      lines.map((l) => (l.uid === uid ? { ...l, promo_reason: reason } : l))
    );
  }

  removeLine(uid: string): void {
    this.cart.update((lines) => lines.filter((l) => l.uid !== uid));
  }

  confirmSaveWithoutPendingPromos(): void {
    this.pendingPromoConfirmOpen.set(false);
    this.submitOrder(this.pendingOpenPdf, true);
  }

  submitOrder(openPdfAfter = false, bypassPromoCheck = false): void {
    this.formError.set(null);

    const normalizedDigits = this.customerPhone.replace(/\D+/g, '');
    if (normalizedDigits.length < 7) {
      this.currentStep.set(1);
      this.formError.set('Ingresa un número de celular válido (mínimo 7 dígitos).');
      return;
    }

    if (this.customerName.trim().length < 2) {
      this.currentStep.set(1);
      this.formError.set('Ingresa el nombre del cliente.');
      return;
    }

    const savedAddr = this.selectedSavedAddress();
    const usingSaved = !this.useNewAddress() && savedAddr !== null;
    const deliveryAddress = usingSaved ? savedAddr.address : this.newAddressText.trim();

    if (deliveryAddress.length < 4) {
      this.currentStep.set(2);
      this.formError.set('Selecciona un domicilio guardado o busca el domicilio de entrega.');
      return;
    }

    if (this.deliveryTimeMode() === 'scheduled' && !this.scheduledDeliveryTime().trim()) {
      this.currentStep.set(2);
      this.formError.set('Selecciona la hora de entrega programada o elige "Lo antes posible".');
      return;
    }

    if (this.cart().length === 0) {
      this.currentStep.set(3);
      this.formError.set('Agrega al menos un producto o paquete al pedido.');
      return;
    }

    if (!bypassPromoCheck && this.hasUnappliedQualifyingPromos()) {
      this.pendingOpenPdf = openPdfAfter;
      this.pendingPromoConfirmOpen.set(true);
      return;
    }

    this.submitting.set(true);

    const payload = {
      customer_phone: this.customerPhone.trim(),
      customer_name: this.customerName.trim(),
      customer_address_id: usingSaved ? savedAddr.id : null,
      delivery_address: deliveryAddress,
      delivery_references: usingSaved
        ? this.savedAddressReferences.trim() || null
        : this.newAddressReferences.trim() || null,
      delivery_date: this.deliveryDate(),
      delivery_time: this.activeDeliveryTimeLabel,
      delivery_place_id: usingSaved ? savedAddr.place_id : this.newAddressPlaceId,
      delivery_lat: usingSaved ? savedAddr.latitude : this.newAddressLat,
      delivery_lng: usingSaved ? savedAddr.longitude : this.newAddressLng,
      address_label: usingSaved ? savedAddr.label : this.newAddressLabel.trim() || null,
      notes: this.orderNotes.trim() || null,
      applied_promotion_ids: this.selectedQualifyingDiscounts().map((q) => q.promo.id),
      manual_discount_type: this.manualDiscountAmount() > 0 ? this.manualDiscountType() : null,
      manual_discount_value: this.manualDiscountAmount() > 0 ? this.manualDiscountValue() : null,
      manual_discount_reason:
        this.manualDiscountAmount() > 0 ? this.manualDiscountReason().trim() || null : null,
      items: this.cart().map((item) => ({
        item_type: item.item_type,
        product_id: item.product_id,
        package_id: item.package_id,
        promotion_id: item.promotion_id ?? null,
        product_name: item.item_type === 'promo_custom' ? item.product_name : undefined,
        quantity: item.quantity,
        is_promo: item.is_promo,
        promo_reason: item.is_promo ? item.promo_reason.trim() || 'Regalo / Promoción' : null,
        package_details: item.package_details ?? null,
      })),
    };

    const isEdit = this.editOrderId() !== null;
    const request$ = isEdit
      ? this.api.updateOrder(this.editOrderId()!, payload)
      : this.api.createOrder(payload);

    request$.subscribe({
      next: (order) => {
        this.submitting.set(false);
        const actionWord = isEdit ? 'modificado' : 'registrado';
        this.toast.success(`Pedido ${order.order_number} ${actionWord} (${this.formatCurrency(order.total)}).`);
        if (openPdfAfter) {
          this.api.downloadOrderPdf(order.id).subscribe({
            next: (blob) => {
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank');
              void this.router.navigate(['/pedidos']);
            },
            error: () => void this.router.navigate(['/pedidos']),
          });
        } else {
          void this.router.navigate(['/pedidos']);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        const firstValidation = err?.error?.errors
          ? Object.values(err.error.errors).flat()[0]
          : null;
        this.formError.set(
          (firstValidation as string) ||
            err?.error?.message ||
            'No se pudo guardar el pedido. Revisa los datos.'
        );
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
