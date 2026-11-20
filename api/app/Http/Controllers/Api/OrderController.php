<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Package;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\WhatsAppDevice;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function today(Request $request): JsonResponse
    {
        $todayStr = Carbon::today()->toDateString();
        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();

        // Scope to match orders delivered/due today
        $forTodayScope = function ($q) use ($todayStr, $todayStart, $todayEnd) {
            $q->whereDate('delivery_date', $todayStr)
                ->orWhere(function ($sub) use ($todayStart, $todayEnd) {
                    $sub->whereNull('delivery_date')
                        ->whereBetween('created_at', [$todayStart, $todayEnd]);
                });
        };

        $allToday = Order::query()
            ->where($forTodayScope)
            ->get(['id', 'is_delivered', 'total', 'delivery_date']);

        $pendingQuery = Order::query()
            ->with(['items', 'assignedEmployee'])
            ->where('is_delivered', false)
            ->where($forTodayScope);

        if ($search = trim((string) $request->query('search', ''))) {
            $pendingQuery->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('delivery_address', 'like', "%{$search}%");
            });
        }

        $pendingOrders = $pendingQuery
            ->orderBy('delivery_time')
            ->orderByDesc('id')
            ->get();

        // Upcoming orders (scheduled for future dates)
        $upcomingQuery = Order::query()
            ->with(['items', 'assignedEmployee'])
            ->where('is_delivered', false)
            ->whereDate('delivery_date', '>', $todayStr);

        if ($search = trim((string) $request->query('search', ''))) {
            $upcomingQuery->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('delivery_address', 'like', "%{$search}%");
            });
        }

        $upcomingOrders = $upcomingQuery
            ->orderBy('delivery_date')
            ->orderBy('delivery_time')
            ->orderBy('id')
            ->get();

        $pendingCount = $allToday->where('is_delivered', false)->count();
        $deliveredCount = $allToday->where('is_delivered', true)->count();
        $pendingAmount = round((float) $allToday->where('is_delivered', false)->sum('total'), 2);
        $deliveredAmount = round((float) $allToday->where('is_delivered', true)->sum('total'), 2);

        return response()->json([
            'date' => $todayStr,
            'orders' => $pendingOrders,
            'upcoming_orders' => $upcomingOrders,
            'summary' => [
                'pending_count' => $pendingCount,
                'delivered_count' => $deliveredCount,
                'total_orders_today' => $allToday->count(),
                'pending_amount' => $pendingAmount,
                'delivered_amount' => $deliveredAmount,
                'total_sales_today' => round($pendingAmount + $deliveredAmount, 2),
                'upcoming_count' => $upcomingOrders->count(),
                'upcoming_amount' => round((float) $upcomingOrders->sum('total'), 2),
            ],
        ]);
    }

    public function upcoming(Request $request): JsonResponse
    {
        $todayStr = Carbon::today()->toDateString();
        $query = Order::query()
            ->with(['items', 'assignedEmployee'])
            ->where('is_delivered', false)
            ->whereDate('delivery_date', '>', $todayStr);

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('delivery_address', 'like', "%{$search}%");
            });
        }

        $upcoming = $query
            ->orderBy('delivery_date')
            ->orderBy('delivery_time')
            ->orderBy('id')
            ->get();

        return response()->json($upcoming);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Order::query()->with(['items', 'assignedEmployee']);

        if ($date = trim((string) $request->query('date', ''))) {
            $dayStr = Carbon::parse($date)->toDateString();
            $day = Carbon::parse($date);
            $query->where(function ($q) use ($dayStr, $day) {
                $q->whereDate('delivery_date', $dayStr)
                    ->orWhere(function ($sub) use ($day) {
                        $sub->whereNull('delivery_date')
                            ->whereBetween('created_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()]);
                    });
            });
        }

        $status = $request->query('status', 'all');
        if ($status === 'pending') {
            $query->where('is_delivered', false);
        } elseif ($status === 'delivered') {
            $query->where('is_delivered', true);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('delivery_address', 'like', "%{$search}%");
            });
        }

        $orders = $query
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(150)
            ->get();

        return response()->json($orders);
    }

    public function show(Order $order): JsonResponse
    {
        return response()->json($order->load(['items', 'customer.addresses', 'assignedEmployee']));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateOrderPayload($request);
        $order = $this->processOrderData($data, $request);

        return response()->json($order, 201);
    }

    public function update(Request $request, Order $order): JsonResponse
    {
        $data = $this->validateOrderPayload($request);
        $updatedOrder = $this->processOrderData($data, $request, $order);

        return response()->json($updatedOrder);
    }

    public function destroy(Order $order): JsonResponse
    {
        $orderNumber = $order->order_number;

        DB::transaction(function () use ($order) {
            $order->items()->delete();
            $order->delete();
        });

        return response()->json([
            'message' => "Pedido {$orderNumber} eliminado correctamente.",
        ]);
    }

    public function deliver(Order $order): JsonResponse
    {
        if (! $order->is_delivered) {
            $order->update([
                'is_delivered' => true,
                'delivered_at' => now(),
            ]);
        }

        return response()->json([
            'message' => "Pedido {$order->order_number} marcado como entregado.",
            'order' => $order->load('items'),
        ]);
    }

    public function pdf(Order $order): Response
    {
        $order->load('items');

        $logoBase64 = null;
        $logoPath = public_path('images/logo-mary.jpg');
        if (is_file($logoPath)) {
            $logoBase64 = 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($logoPath));
        }

        $pdf = Pdf::loadView('pdf.order', [
            'order' => $order,
            'logoBase64' => $logoBase64,
        ])->setPaper('letter', 'portrait');

        return $pdf->download("pedido-{$order->order_number}.pdf");
    }

    private function validateOrderPayload(Request $request): array
    {
        $data = $request->validate([
            'customer_phone' => ['required', 'string', 'min:7', 'max:30'],
            'customer_name' => ['required', 'string', 'min:2', 'max:150'],
            'customer_address_id' => ['nullable', 'integer'],
            'delivery_address' => ['required', 'string', 'min:4', 'max:500'],
            'delivery_references' => ['nullable', 'string', 'max:300'],
            'delivery_date' => ['nullable', 'date'],
            'delivery_time' => ['nullable', 'string', 'max:60'],
            'delivery_place_id' => ['nullable', 'string', 'max:255'],
            'delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'address_label' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'assigned_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'applied_promotion_ids' => ['nullable', 'array'],
            'applied_promotion_ids.*' => ['integer', 'exists:promotions,id'],
            'manual_discount_type' => ['nullable', 'in:fixed,percent'],
            'manual_discount_value' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'manual_discount_reason' => ['nullable', 'string', 'max:150'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_type' => ['sometimes', 'in:product,package,promo_combo,promo_custom'],
            'items.*.product_id' => ['nullable', 'integer'],
            'items.*.package_id' => ['nullable', 'integer'],
            'items.*.promotion_id' => ['nullable', 'integer'],
            'items.*.product_name' => ['nullable', 'string', 'max:150'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'items.*.is_promo' => ['required', 'boolean'],
            'items.*.promo_reason' => ['nullable', 'string', 'max:120'],
            'items.*.package_details' => ['nullable', 'array'],
            'items.*.package_details.*.group_id' => ['nullable', 'integer'],
            'items.*.package_details.*.option_id' => ['nullable', 'integer'],
            'items.*.package_details.*.group' => ['required_with:items.*.package_details', 'string', 'max:150'],
            'items.*.package_details.*.label' => ['required_with:items.*.package_details', 'string', 'max:150'],
            'items.*.package_details.*.quantity' => ['required_with:items.*.package_details', 'integer', 'min:1', 'max:9999'],
        ]);

        $normalizedPhone = Customer::normalizePhone($data['customer_phone']);
        if (strlen($normalizedPhone) < 7) {
            throw ValidationException::withMessages([
                'customer_phone' => ['Ingresa un número de celular válido (al menos 7 dígitos).'],
            ]);
        }

        $data['_normalized_phone'] = $normalizedPhone;

        return $data;
    }

    private function processOrderData(array $data, Request $request, ?Order $existingOrder = null): Order
    {
        $normalizedPhone = $data['_normalized_phone'];

        return DB::transaction(function () use ($data, $normalizedPhone, $request, $existingOrder) {
            $customerName = trim($data['customer_name']);

            // 1. Find or create customer automatically by phone
            $customer = Customer::where('phone', $normalizedPhone)->first();
            if ($customer) {
                if ($customer->name !== $customerName) {
                    $customer->update(['name' => $customerName]);
                }
            } else {
                $customer = Customer::create([
                    'phone' => $normalizedPhone,
                    'name' => $customerName,
                ]);
            }

            // 2. Resolve or assign delivery address to this customer
            $addressText = trim($data['delivery_address']);
            $references = isset($data['delivery_references']) && trim($data['delivery_references']) !== ''
                ? trim($data['delivery_references'])
                : null;
            $placeId = isset($data['delivery_place_id']) && trim($data['delivery_place_id']) !== ''
                ? trim($data['delivery_place_id'])
                : null;
            $lat = isset($data['delivery_lat']) ? (float) $data['delivery_lat'] : null;
            $lng = isset($data['delivery_lng']) ? (float) $data['delivery_lng'] : null;
            $label = isset($data['address_label']) && trim($data['address_label']) !== ''
                ? trim($data['address_label'])
                : null;

            $customerAddress = null;
            if (! empty($data['customer_address_id'])) {
                $customerAddress = CustomerAddress::where('id', $data['customer_address_id'])
                    ->where('customer_id', $customer->id)
                    ->first();
            }

            if (! $customerAddress && $placeId) {
                $customerAddress = CustomerAddress::where('customer_id', $customer->id)
                    ->where('place_id', $placeId)
                    ->first();
            }

            if (! $customerAddress) {
                $normalizedAddressText = mb_strtolower($addressText);
                $customerAddress = CustomerAddress::where('customer_id', $customer->id)
                    ->get()
                    ->first(fn (CustomerAddress $addr) => mb_strtolower(trim($addr->address)) === $normalizedAddressText);
            }

            if ($customerAddress) {
                $customerAddress->update([
                    'references' => $references ?? $customerAddress->references,
                    'label' => $label ?? $customerAddress->label,
                    'place_id' => $placeId ?? $customerAddress->place_id,
                    'latitude' => $lat ?? $customerAddress->latitude,
                    'longitude' => $lng ?? $customerAddress->longitude,
                    'last_used_at' => now(),
                ]);
            } else {
                $existingCount = CustomerAddress::where('customer_id', $customer->id)->count();
                $customerAddress = CustomerAddress::create([
                    'customer_id' => $customer->id,
                    'label' => $label ?? ($existingCount === 0 ? 'Principal' : 'Domicilio ' . ($existingCount + 1)),
                    'address' => $addressText,
                    'references' => $references,
                    'place_id' => $placeId,
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'last_used_at' => now(),
                ]);
            }

            // 3. Validate items (products, packages, fixed-price combos, gifts) & compute subtotal
            $productIds = collect($data['items'])->pluck('product_id')->filter()->unique()->values();
            $productsById = Product::whereIn('id', $productIds)->get()->keyBy('id');

            $packageIds = collect($data['items'])->pluck('package_id')->filter()->unique()->values();
            $packagesById = Package::with('groups.options')->whereIn('id', $packageIds)->get()->keyBy('id');

            $comboPromoIds = collect($data['items'])
                ->filter(fn ($i) => ($i['item_type'] ?? null) === 'promo_combo')
                ->pluck('promotion_id')
                ->filter()
                ->unique()
                ->values();
            $comboPromosById = Promotion::whereIn('id', $comboPromoIds)->get()->keyBy('id');

            $preparedItems = [];
            $subtotal = 0.0;
            $promoSavings = 0.0;

            foreach ($data['items'] as $index => $rawItem) {
                $isPromo = (bool) $rawItem['is_promo'];
                $qty = (int) $rawItem['quantity'];
                $productId = $rawItem['product_id'] ?? null;
                $packageId = $rawItem['package_id'] ?? null;
                $promotionId = $rawItem['promotion_id'] ?? null;
                $itemType = $rawItem['item_type'] ?? ($packageId ? 'package' : ($productId ? 'product' : 'promo_custom'));
                $packageDetails = null;

                if ($itemType === 'package') {
                    $package = $packageId ? $packagesById->get($packageId) : null;
                    if (! $package) {
                        throw ValidationException::withMessages([
                            "items.{$index}.package_id" => ['El paquete seleccionado no existe.'],
                        ]);
                    }

                    [$normalizedDetails, $extraCostPerPackage] = $this->resolvePackageSelections(
                        $package,
                        $rawItem['package_details'] ?? [],
                        $index
                    );

                    $packageDetails = $normalizedDetails;
                    $productName = $package->name;
                    $unitPrice = round((float) $package->base_price + $extraCostPerPackage, 2);
                    $productId = null;
                } elseif ($itemType === 'promo_combo') {
                    $promoCombo = $promotionId ? $comboPromosById->get($promotionId) : null;
                    if (! $promoCombo || $promoCombo->type !== 'fixed_price_combo') {
                        throw ValidationException::withMessages([
                            "items.{$index}.promotion_id" => ['El combo promocional seleccionado no existe o no es válido.'],
                        ]);
                    }

                    $productName = $promoCombo->name;
                    $unitPrice = round((float) ($promoCombo->fixed_price ?? 0), 2);
                    $packageDetails = collect($promoCombo->combo_items ?? [])->map(fn ($ci) => [
                        'group' => 'Combo Promoción',
                        'label' => $ci['label'] ?? '',
                        'quantity' => (int) ($ci['quantity'] ?? 1),
                        'extra_price' => 0.0,
                    ])->values()->all();
                    $productId = null;
                    $packageId = null;
                } elseif ($productId) {
                    $product = $productsById->get($productId);
                    if (! $product) {
                        throw ValidationException::withMessages([
                            "items.{$index}.product_id" => ['El producto seleccionado no existe en el catálogo.'],
                        ]);
                    }
                    $productName = $product->name;
                    $unitPrice = (float) $product->price;
                    $itemType = 'product';
                } else {
                    if (! $isPromo || empty(trim((string) ($rawItem['product_name'] ?? '')))) {
                        throw ValidationException::withMessages([
                            "items.{$index}.product_name" => ['Selecciona un producto del catálogo o indica el nombre de la promoción/regalo.'],
                        ]);
                    }
                    $productName = trim((string) $rawItem['product_name']);
                    $unitPrice = 0.0;
                    $itemType = 'promo_custom';
                }

                $lineTotal = $isPromo ? 0.0 : round($unitPrice * $qty, 2);
                if ($isPromo) {
                    $promoSavings += round($unitPrice * $qty, 2);
                } else {
                    $subtotal += $lineTotal;
                }

                $promoReason = null;
                if ($isPromo) {
                    $promoReason = ! empty(trim((string) ($rawItem['promo_reason'] ?? '')))
                        ? trim((string) $rawItem['promo_reason'])
                        : 'Regalo / Promoción';
                }

                $preparedItems[] = [
                    'product_id' => $productId,
                    'package_id' => $packageId,
                    'promotion_id' => $promotionId,
                    'item_type' => $itemType,
                    'product_name' => $productName,
                    'unit_price' => $unitPrice,
                    'quantity' => $qty,
                    'is_promo' => $isPromo,
                    'promo_reason' => $promoReason,
                    'package_details' => $packageDetails,
                    'line_total' => $lineTotal,
                ];
            }

            $subtotal = round($subtotal, 2);
            $promoSavings = round($promoSavings, 2);

            // 4. Evaluate Type 2 Promotional Discounts ($ or %)
            $requestedPromoIds = collect($data['applied_promotion_ids'] ?? [])->unique()->values();
            [$promoDiscountAmount, $appliedPromotions] = $this->calculatePromotionalDiscounts(
                $requestedPromoIds->all(),
                $preparedItems,
                $subtotal
            );

            // 5. Evaluate Manual Discount ($ or %)
            $remainingAfterPromos = max(0.0, round($subtotal - $promoDiscountAmount, 2));
            $manualType = $data['manual_discount_type'] ?? null;
            $manualValue = round((float) ($data['manual_discount_value'] ?? 0), 2);
            $manualReason = isset($data['manual_discount_reason']) && trim($data['manual_discount_reason']) !== ''
                ? trim($data['manual_discount_reason'])
                : null;
            $manualDiscountAmount = 0.0;

            if ($manualType === 'percent' && $manualValue > 0) {
                $pct = min(100.0, $manualValue);
                $manualDiscountAmount = round($remainingAfterPromos * ($pct / 100.0), 2);
                $manualValue = $pct;
            } elseif ($manualType === 'fixed' && $manualValue > 0) {
                $manualDiscountAmount = min($remainingAfterPromos, $manualValue);
            } else {
                $manualType = null;
                $manualValue = 0.0;
                $manualReason = null;
            }

            $finalTotal = max(0.0, round($subtotal - $promoDiscountAmount - $manualDiscountAmount, 2));

            $deliveryDate = ! empty($data['delivery_date'])
                ? Carbon::parse($data['delivery_date'])->toDateString()
                : Carbon::today()->toDateString();

            $deliveryTime = isset($data['delivery_time']) && trim((string) $data['delivery_time']) !== ''
                ? trim((string) $data['delivery_time'])
                : null;

            $notes = isset($data['notes']) && trim($data['notes']) !== '' ? trim($data['notes']) : null;

            if ($existingOrder) {
                // Update existing order
                $existingOrder->update([
                    'customer_id' => $customer->id,
                    'customer_address_id' => $customerAddress->id,
                    'customer_name' => $customerName,
                    'customer_phone' => $normalizedPhone,
                    'delivery_address' => $customerAddress->address,
                    'delivery_references' => $references,
                    'delivery_date' => $deliveryDate,
                    'delivery_time' => $deliveryTime,
                    'delivery_place_id' => $placeId,
                    'delivery_lat' => $lat,
                    'delivery_lng' => $lng,
                    'subtotal' => $subtotal,
                    'promo_savings' => $promoSavings,
                    'promo_discount_amount' => $promoDiscountAmount,
                    'applied_promotions' => ! empty($appliedPromotions) ? $appliedPromotions : null,
                    'manual_discount_type' => $manualType,
                    'manual_discount_value' => $manualValue,
                    'manual_discount_amount' => $manualDiscountAmount,
                    'manual_discount_reason' => $manualReason,
                    'total' => $finalTotal,
                    'notes' => $notes,
                    'assigned_employee_id' => array_key_exists('assigned_employee_id', $data) ? $data['assigned_employee_id'] : $existingOrder->assigned_employee_id,
                ]);

                $existingOrder->items()->delete();
                $existingOrder->items()->createMany($preparedItems);

                return $existingOrder->fresh()->load(['items', 'customer.addresses', 'assignedEmployee']);
            }

            // 6. Generate unique daily order number for new order
            $todayPrefix = 'TD-' . Carbon::today()->format('Ymd') . '-';
            $todaySeq = Order::whereBetween('created_at', [
                Carbon::today()->startOfDay(),
                Carbon::today()->endOfDay(),
            ])->count() + 1;

            do {
                $orderNumber = $todayPrefix . str_pad((string) $todaySeq, 3, '0', STR_PAD_LEFT);
                $todaySeq++;
            } while (Order::where('order_number', $orderNumber)->exists());

            // 7. Create Order & Items
            $order = Order::create([
                'order_number' => $orderNumber,
                'customer_id' => $customer->id,
                'customer_address_id' => $customerAddress->id,
                'customer_name' => $customerName,
                'customer_phone' => $normalizedPhone,
                'delivery_address' => $customerAddress->address,
                'delivery_references' => $references,
                'delivery_date' => $deliveryDate,
                'delivery_time' => $deliveryTime,
                'delivery_place_id' => $placeId,
                'delivery_lat' => $lat,
                'delivery_lng' => $lng,
                'subtotal' => $subtotal,
                'promo_savings' => $promoSavings,
                'promo_discount_amount' => $promoDiscountAmount,
                'applied_promotions' => ! empty($appliedPromotions) ? $appliedPromotions : null,
                'manual_discount_type' => $manualType,
                'manual_discount_value' => $manualValue,
                'manual_discount_amount' => $manualDiscountAmount,
                'manual_discount_reason' => $manualReason,
                'total' => $finalTotal,
                'notes' => $notes,
                'assigned_employee_id' => $data['assigned_employee_id'] ?? null,
                'is_delivered' => false,
                'created_by' => $request->user()?->id,
            ]);

            $order->items()->createMany($preparedItems);

            return $order->load(['items', 'customer.addresses', 'assignedEmployee']);
        });
    }

    /**
     * Validate and compute Type 2 promotional discounts ($ or %) server-side.
     *
     * @return array{0: float, 1: array<int, array<string, mixed>>}
     */
    private function calculatePromotionalDiscounts(array $promoIds, array $preparedItems, float $subtotal): array
    {
        if (empty($promoIds)) {
            return [0.0, []];
        }

        $promos = Promotion::whereIn('id', $promoIds)
            ->where('is_active', true)
            ->where('type', 'discount')
            ->get();

        $paidItems = collect($preparedItems)->where('is_promo', false);
        $totalDiscount = 0.0;
        $applied = [];

        foreach ($promos as $promo) {
            $minQty = max(1, (int) ($promo->min_quantity ?? 1));
            $minAmount = (float) ($promo->min_order_amount ?? 0);
            $qualifyingBase = 0.0;
            $qualifies = false;

            if ($promo->target_scope === 'all_packages') {
                $matching = $paidItems->where('item_type', 'package');
                $qtySum = (int) $matching->sum('quantity');
                $qualifyingBase = (float) $matching->sum('line_total');
                $qualifies = $qtySum >= $minQty && $qualifyingBase >= $minAmount;
            } elseif ($promo->target_scope === 'packages') {
                $targetIds = collect($promo->target_package_ids ?? [])->map(fn ($id) => (int) $id)->all();
                $matching = $paidItems->where('item_type', 'package')->whereIn('package_id', $targetIds);
                $qtySum = (int) $matching->sum('quantity');
                $qualifyingBase = (float) $matching->sum('line_total');
                $qualifies = $qtySum >= $minQty && $qualifyingBase >= $minAmount;
            } elseif ($promo->target_scope === 'products') {
                $targetIds = collect($promo->target_product_ids ?? [])->map(fn ($id) => (int) $id)->all();
                $matching = $paidItems->where('item_type', 'product')->whereIn('product_id', $targetIds);
                $qtySum = (int) $matching->sum('quantity');
                $qualifyingBase = (float) $matching->sum('line_total');
                $qualifies = $qtySum >= $minQty && $qualifyingBase >= $minAmount;
            } else {
                // order_total
                $qualifyingBase = $subtotal;
                $qualifies = $subtotal > 0 && $subtotal >= $minAmount;
            }

            if (! $qualifies) {
                throw ValidationException::withMessages([
                    'applied_promotion_ids' => ["El pedido no cumple las condiciones para la promoción '{$promo->name}'."],
                ]);
            }

            $val = (float) ($promo->discount_value ?? 0);
            $amount = $promo->discount_type === 'percent'
                ? round($qualifyingBase * (min(100.0, max(0.0, $val)) / 100.0), 2)
                : min($qualifyingBase, round(max(0.0, $val), 2));

            if ($amount > 0) {
                $totalDiscount += $amount;
                $applied[] = [
                    'promotion_id' => $promo->id,
                    'name' => $promo->name,
                    'discount_type' => $promo->discount_type,
                    'discount_value' => $val,
                    'discount_amount' => $amount,
                ];
            }
        }

        return [min($subtotal, round($totalDiscount, 2)), $applied];
    }

    /**
     * Validate package selections against package groups/options and calculate extra price sum.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: float}
     */
    private function resolvePackageSelections(Package $package, array $rawSelections, int $itemIndex): array
    {
        $groups = $package->groups;
        $groupCounts = [];
        $normalized = [];
        $extraSum = 0.0;

        foreach ($rawSelections as $sel) {
            $selQty = (int) ($sel['quantity'] ?? 0);
            if ($selQty <= 0) {
                continue;
            }

            $matchedGroup = null;
            if (! empty($sel['group_id'])) {
                $matchedGroup = $groups->firstWhere('id', (int) $sel['group_id']);
            }
            if (! $matchedGroup) {
                $matchedGroup = $groups->first(
                    fn ($g) => mb_strtolower(trim($g->name)) === mb_strtolower(trim((string) ($sel['group'] ?? '')))
                );
            }
            if (! $matchedGroup) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.package_details" => ["Grupo inválido dentro del paquete {$package->name}."],
                ]);
            }

            $matchedOption = null;
            if (! empty($sel['option_id'])) {
                $matchedOption = $matchedGroup->options->firstWhere('id', (int) $sel['option_id']);
            }
            if (! $matchedOption) {
                $matchedOption = $matchedGroup->options->first(
                    fn ($o) => mb_strtolower(trim($o->label)) === mb_strtolower(trim((string) ($sel['label'] ?? '')))
                );
            }
            if (! $matchedOption) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.package_details" => ["Opción no permitida en el grupo {$matchedGroup->name}."],
                ]);
            }

            $gid = $matchedGroup->id;
            $groupCounts[$gid] = ($groupCounts[$gid] ?? 0) + $selQty;
            $extraPrice = (float) $matchedOption->extra_price;
            $extraSum += round($extraPrice * $selQty, 2);

            $normalized[] = [
                'group_id' => $matchedGroup->id,
                'option_id' => $matchedOption->id,
                'group' => $matchedGroup->name,
                'label' => $matchedOption->label,
                'quantity' => $selQty,
                'extra_price' => $extraPrice,
            ];
        }

        foreach ($groups as $group) {
            $count = $groupCounts[$group->id] ?? 0;
            if ($count > $group->max_quantity) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.package_details" => [
                        "En '{$group->name}' de {$package->name} solo puedes elegir hasta {$group->max_quantity} unidades (elegiste {$count}).",
                    ],
                ]);
            }
            if ($count < $group->min_quantity) {
                throw ValidationException::withMessages([
                    "items.{$itemIndex}.package_details" => [
                        "Debes elegir al menos {$group->min_quantity} unidad(es) en '{$group->name}' de {$package->name}.",
                    ],
                ]);
            }
        }

        return [$normalized, round($extraSum, 2)];
    }

    public function sendWhatsApp(Request $request, Order $order): JsonResponse
    {
        $request->validate([
            'recipient_type' => ['required', 'in:customer,employee,custom'],
            'phone' => ['nullable', 'string', 'min:8', 'max:25'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'device_id' => ['nullable', 'integer', 'exists:whatsapp_devices,id'],
            'message' => ['nullable', 'string', 'max:2000'],
            'send_pdf' => ['nullable', 'boolean'],
        ]);

        $order->load(['items', 'assignedEmployee']);

        $recipientType = $request->input('recipient_type');
        $targetPhone = $request->input('phone');
        $employee = null;

        if ($recipientType === 'employee') {
            $employeeId = $request->input('employee_id') ?: $order->assigned_employee_id;
            if (! $employeeId) {
                return response()->json([
                    'success' => false,
                    'error' => 'No se seleccionó ningún empleado para enviar la notificación.',
                ], 422);
            }
            $employee = Employee::find($employeeId);
            if (! $employee) {
                return response()->json(['success' => false, 'error' => 'Empleado no encontrado.'], 404);
            }
            $targetPhone = $targetPhone ?: $employee->phone;
        } elseif ($recipientType === 'customer') {
            $targetPhone = $targetPhone ?: $order->customer_phone;
        }

        if (empty($targetPhone)) {
            return response()->json([
                'success' => false,
                'error' => 'No se especificó un número de teléfono destino.',
            ], 422);
        }

        $cleanNumber = preg_replace('/\D/', '', $targetPhone);
        if (strlen($cleanNumber) < 8) {
            return response()->json([
                'success' => false,
                'error' => 'El número de teléfono debe tener al menos 8 dígitos.',
            ], 422);
        }

        if (strlen($cleanNumber) === 10) {
            $cleanNumber = '521' . $cleanNumber;
        } elseif (strlen($cleanNumber) === 12 && str_starts_with($cleanNumber, '52') && !str_starts_with($cleanNumber, '521')) {
            $cleanNumber = '521' . substr($cleanNumber, 2);
        }

        $deviceId = $request->input('device_id');
        $device = null;
        if ($deviceId) {
            $device = WhatsAppDevice::find($deviceId);
        }
        if (! $device) {
            $device = WhatsAppDevice::where('status', 'CONNECTED')->where('is_default', true)->first()
                ?: WhatsAppDevice::where('status', 'CONNECTED')->first()
                ?: WhatsAppDevice::where('is_default', true)->first()
                ?: WhatsAppDevice::first();
        }

        if (! $device) {
            return response()->json([
                'success' => false,
                'error' => 'No hay ningún dispositivo de WhatsApp configurado en el sistema. Vincula una línea en la sección WhatsApp.',
            ], 422);
        }

        $messageText = trim((string) $request->input('message'));
        if (empty($messageText)) {
            $messageText = $this->buildOrderWhatsAppTemplate($order, $recipientType, $employee);
        }

        $savedUrl = AppSetting::getValue('whatsapp_api_url');
        $apiUrl = rtrim($savedUrl ?: env('WHATSAPP_API_URL', 'https://whatsapp-api-production-80b7.up.railway.app'), '/');
        $sendPdf = $request->boolean('send_pdf');

        try {
            if ($sendPdf) {
                $pdfBase64 = $this->generateOrderPdfBase64($order);
                $fileName = "ticket-{$order->order_number}.pdf";

                $response = Http::timeout(25)->post("{$apiUrl}/sessions/{$device->session_id}/send-media", [
                    'numero' => $cleanNumber,
                    'mediaBase64' => $pdfBase64,
                    'fileName' => $fileName,
                    'type' => 'document',
                    'mimetype' => 'application/pdf',
                    'caption' => $messageText,
                ]);
            } else {
                $response = Http::timeout(15)->post("{$apiUrl}/sessions/{$device->session_id}/send-message", [
                    'numero' => $cleanNumber,
                    'mensaje' => $messageText,
                ]);
            }

            if ($response->successful()) {
                return response()->json([
                    'success' => true,
                    'message' => $sendPdf
                        ? '¡Ticket PDF de WhatsApp enviado exitosamente!'
                        : '¡Mensaje de WhatsApp enviado exitosamente!',
                    'device' => $device->name,
                    'recipient' => $cleanNumber,
                    'sent_text' => $messageText,
                    'sent_pdf' => $sendPdf,
                ]);
            }

            $errMsg = $response->json('error') ?: 'El servicio de WhatsApp no pudo entregar el mensaje. Verifica que la línea esté conectada.';
            return response()->json([
                'success' => false,
                'error' => $errMsg,
            ], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error' => 'Error de conexión con el servicio de WhatsApp en Railway: ' . $e->getMessage(),
            ], 500);
        }
    }

    private function generateOrderPdfBase64(Order $order): string
    {
        $order->load('items');

        $logoBase64 = null;
        $logoPath = public_path('images/logo-mary.jpg');
        if (is_file($logoPath)) {
            $logoBase64 = 'data:image/jpeg;base64,' . base64_encode((string) file_get_contents($logoPath));
        }

        $pdf = Pdf::loadView('pdf.order', [
            'order' => $order,
            'logoBase64' => $logoBase64,
        ])->setPaper('letter', 'portrait');

        return base64_encode($pdf->output());
    }

    private function buildOrderWhatsAppTemplate(Order $order, string $type, ?Employee $employee = null): string
    {
        $dateStr = $order->delivery_date ? Carbon::parse($order->delivery_date)->format('d/m/Y') : Carbon::today()->format('d/m/Y');
        $timeStr = $order->delivery_time ?: 'Horario habitual';
        $itemsList = '';
        foreach ($order->items as $item) {
            $promoTag = $item->is_promo ? ' (PROMO)' : '';
            $itemsList .= "• {$item->quantity}x {$item->product_name}{$promoTag} - $" . number_format($item->line_total, 2) . "\n";
        }

        if ($type === 'employee') {
            $mapsUrl = '';
            if ($order->delivery_lat && $order->delivery_lng) {
                $mapsUrl = "https://www.google.com/maps/search/?api=1&query={$order->delivery_lat},{$order->delivery_lng}";
            } else {
                $query = urlencode($order->delivery_address);
                $mapsUrl = "https://www.google.com/maps/search/?api=1&query={$query}";
            }

            $dateObj = $order->delivery_date ? Carbon::parse($order->delivery_date)->locale('es') : Carbon::today()->locale('es');
            $dateText = ucfirst($dateObj->translatedFormat('l, j \d\e F \d\e Y'));
            $timeText = $order->delivery_time ?: 'Lo antes posible';

            $itemsOnly = '';
            foreach ($order->items as $item) {
                $promoTag = $item->is_promo ? ' (PROMO)' : '';
                $itemsOnly .= "• {$item->quantity}x {$item->product_name}{$promoTag}\n";
            }
            if ($order->notes) {
                $itemsOnly .= "📝 Notas: {$order->notes}\n";
            }

            return "🗺️ *MAPA:*\n"
                . "{$mapsUrl}\n"
                . "📍 {$order->delivery_address}" . ($order->delivery_references ? " (Ref: {$order->delivery_references})" : "") . "\n\n"
                . "📱 *CELULAR:*\n"
                . "{$order->customer_phone} ({$order->customer_name})\n\n"
                . "📅 *FECHA Y HORA:*\n"
                . "{$dateText} — {$timeText}\n\n"
                . "💵 *TOTAL A COBRAR:*\n"
                . "$" . number_format($order->total, 2) . " MXN\n\n"
                . "🌮 *PEDIDO (#{$order->order_number}):*\n"
                . trim($itemsOnly);
        }

        return "🌮 *TAQUERÍA MARY* 🌮\n"
            . "¡Hola, *{$order->customer_name}*! Confirmamos tu pedido.\n\n"
            . "📋 *Pedido:* #{$order->order_number}\n"
            . "📅 *Fecha de entrega:* {$dateStr}\n"
            . "⏰ *Hora estimada:* {$timeStr}\n"
            . "📍 *Dirección:* {$order->delivery_address}"
            . ($order->delivery_references ? " (Ref: {$order->delivery_references})" : '') . "\n\n"
            . "🌮 *Tu orden:*\n"
            . $itemsList . "\n"
            . "💰 *Total a pagar:* $" . number_format($order->total, 2) . " MXN"
            . ($order->promo_savings > 0 ? " (Ahorro promocional: $" . number_format($order->promo_savings, 2) . ")" : '')
            . ($order->notes ? "\n💬 *Notas:* {$order->notes}" : '') . "\n\n"
            . "¡Muchas gracias por tu preferencia! 🙌";
    }
}
