import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
  item_type: 'product' | 'package' | 'promo_custom';
  product_id: number | null;
  package_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  is_promo: boolean;
  promo_reason: string;
  package_details?: PackageSelectionItem[] | null;
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

  // Order notes
  orderNotes = '';

  // Catalog, Packages & Promotions
  readonly catalogMode = signal<'packages' | 'products'>('packages');
  readonly products = signal<Product[]>([]);
  readonly packages = signal<MealPackage[]>([]);
  readonly promotions = signal<Promotion[]>([]);
  readonly loadingProducts = signal(true);
  readonly selectedCategory = signal<string>('Todos');
  productSearch = '';

  // Package builder modal & package promotion gift distribution
  readonly buildingPackage = signal<MealPackage | null>(null);
  promoGiftCounts: Record<string, number> = {};

  // Cart & custom promo
  readonly cart = signal<CartLine[]>([]);
  showCustomPromoBox = false;
  customPromoName = '';
  customPromoQty = 1;
  customPromoReason = 'Regalo / Promoción';

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  private uidCounter = 1;
  private readonly phoneInput$ = new Subject<string>();
  private sub?: Subscription;

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

  readonly hasPackageInCart = computed(() =>
    this.cart().some((l) => l.item_type === 'package')
  );

  readonly packagePromotions = computed(() =>
    this.promotions().filter((p) => p.is_active && p.applies_to_packages)
  );

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

  readonly orderTotal = computed(() =>
    Number(
      this.cart()
        .reduce((sum, l) => sum + (l.is_promo ? 0 : l.unit_price * l.quantity), 0)
        .toFixed(2)
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

  getPromoOptQty(promoId: number, option: string): number {
    return this.promoGiftCounts[`${promoId}::${option}`] ?? 0;
  }

  promoTotalSelected(promo: Promotion): number {
    return (promo.allowed_options ?? []).reduce(
      (sum, opt) => sum + this.getPromoOptQty(promo.id, opt),
      0
    );
  }

  adjustPromoGift(promo: Promotion, option: string, delta: number): void {
    const key = `${promo.id}::${option}`;
    const current = this.promoGiftCounts[key] ?? 0;
    const otherTotal = this.promoTotalSelected(promo) - current;
    const maxForThis = Math.max(0, promo.max_quantity - otherTotal);
    const next = Math.min(maxForThis, Math.max(0, current + delta));
    this.promoGiftCounts[key] = next;
  }

  fillPromoGift(promo: Promotion, option: string): void {
    for (const opt of promo.allowed_options ?? []) {
      this.promoGiftCounts[`${promo.id}::${opt}`] = opt === option ? promo.max_quantity : 0;
    }
  }

  applyPackagePromotion(promo: Promotion): void {
    const chosen = (promo.allowed_options ?? [])
      .map((opt) => ({ opt, qty: this.getPromoOptQty(promo.id, opt) }))
      .filter((x) => x.qty > 0);

    if (chosen.length === 0) {
      this.toast.error('Selecciona al menos 1 unidad del regalo promocional.');
      return;
    }

    const summary = chosen.map((x) => `${x.qty}x ${x.opt}`).join(', ');
    this.cart.update((lines) => [
      ...lines,
      {
        uid: `line_${this.uidCounter++}`,
        item_type: 'promo_custom',
        product_id: null,
        package_id: null,
        product_name: `Regalo: ${summary}`,
        unit_price: 0,
        quantity: 1,
        is_promo: true,
        promo_reason: promo.name,
      },
    ]);

    for (const opt of promo.allowed_options ?? []) {
      this.promoGiftCounts[`${promo.id}::${opt}`] = 0;
    }
    this.toast.success(`Regalo "${promo.name}" agregado ($0.00).`);
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

  submitOrder(openPdfAfter = false): void {
    this.formError.set(null);

    const normalizedDigits = this.customerPhone.replace(/\D+/g, '');
    if (normalizedDigits.length < 7) {
      this.formError.set('Ingresa un número de celular válido (mínimo 7 dígitos).');
      return;
    }

    if (this.customerName.trim().length < 2) {
      this.formError.set('Ingresa el nombre del cliente.');
      return;
    }

    const savedAddr = this.selectedSavedAddress();
    const usingSaved = !this.useNewAddress() && savedAddr !== null;
    const deliveryAddress = usingSaved ? savedAddr.address : this.newAddressText.trim();

    if (deliveryAddress.length < 4) {
      this.formError.set('Selecciona un domicilio guardado o busca el domicilio de entrega.');
      return;
    }

    if (this.cart().length === 0) {
      this.formError.set('Agrega al menos un producto o paquete al pedido.');
      return;
    }

    this.submitting.set(true);

    this.api
      .createOrder({
        customer_phone: this.customerPhone.trim(),
        customer_name: this.customerName.trim(),
        customer_address_id: usingSaved ? savedAddr.id : null,
        delivery_address: deliveryAddress,
        delivery_references: usingSaved
          ? this.savedAddressReferences.trim() || null
          : this.newAddressReferences.trim() || null,
        delivery_place_id: usingSaved ? savedAddr.place_id : this.newAddressPlaceId,
        delivery_lat: usingSaved ? savedAddr.latitude : this.newAddressLat,
        delivery_lng: usingSaved ? savedAddr.longitude : this.newAddressLng,
        address_label: usingSaved ? savedAddr.label : this.newAddressLabel.trim() || null,
        notes: this.orderNotes.trim() || null,
        items: this.cart().map((item) => ({
          item_type: item.item_type,
          product_id: item.product_id,
          package_id: item.package_id,
          product_name: item.item_type === 'promo_custom' ? item.product_name : undefined,
          quantity: item.quantity,
          is_promo: item.is_promo,
          promo_reason: item.is_promo ? item.promo_reason.trim() || 'Regalo / Promoción' : null,
          package_details: item.package_details ?? null,
        })),
      })
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.toast.success(`Pedido ${order.order_number} registrado (${this.formatCurrency(order.total)}).`);
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
