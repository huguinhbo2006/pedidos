<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\Order;
use App\Models\Product;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function today(Request $request): JsonResponse
    {
        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();

        $allToday = Order::query()
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->get(['id', 'is_delivered', 'total']);

        $pendingQuery = Order::query()
            ->with(['items'])
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->where('is_delivered', false);

        if ($search = trim((string) $request->query('search', ''))) {
            $pendingQuery->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('delivery_address', 'like', "%{$search}%");
            });
        }

        $pendingOrders = $pendingQuery
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $pendingCount = $allToday->where('is_delivered', false)->count();
        $deliveredCount = $allToday->where('is_delivered', true)->count();
        $pendingAmount = round((float) $allToday->where('is_delivered', false)->sum('total'), 2);
        $deliveredAmount = round((float) $allToday->where('is_delivered', true)->sum('total'), 2);

        return response()->json([
            'date' => Carbon::today()->toDateString(),
            'orders' => $pendingOrders,
            'summary' => [
                'pending_count' => $pendingCount,
                'delivered_count' => $deliveredCount,
                'total_orders_today' => $allToday->count(),
                'pending_amount' => $pendingAmount,
                'delivered_amount' => $deliveredAmount,
                'total_sales_today' => round($pendingAmount + $deliveredAmount, 2),
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Order::query()->with(['items']);

        if ($date = trim((string) $request->query('date', ''))) {
            $day = Carbon::parse($date);
            $query->whereBetween('created_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()]);
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
        return response()->json($order->load(['items', 'customer.addresses']));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_phone' => ['required', 'string', 'min:7', 'max:30'],
            'customer_name' => ['required', 'string', 'min:2', 'max:150'],
            'customer_address_id' => ['nullable', 'integer'],
            'delivery_address' => ['required', 'string', 'min:4', 'max:500'],
            'delivery_references' => ['nullable', 'string', 'max:300'],
            'delivery_place_id' => ['nullable', 'string', 'max:255'],
            'delivery_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'delivery_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'address_label' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['nullable', 'integer'],
            'items.*.product_name' => ['nullable', 'string', 'max:150'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'items.*.is_promo' => ['required', 'boolean'],
            'items.*.promo_reason' => ['nullable', 'string', 'max:120'],
        ]);

        $normalizedPhone = Customer::normalizePhone($data['customer_phone']);
        if (strlen($normalizedPhone) < 7) {
            throw ValidationException::withMessages([
                'customer_phone' => ['Ingresa un número de celular válido (al menos 7 dígitos).'],
            ]);
        }

        $order = DB::transaction(function () use ($data, $normalizedPhone, $request) {
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

            // 3. Validate items & compute subtotal, promo savings, and total
            $productIds = collect($data['items'])
                ->pluck('product_id')
                ->filter()
                ->unique()
                ->values();

            $productsById = Product::whereIn('id', $productIds)->get()->keyBy('id');

            $preparedItems = [];
            $subtotal = 0.0;
            $promoSavings = 0.0;

            foreach ($data['items'] as $index => $rawItem) {
                $isPromo = (bool) $rawItem['is_promo'];
                $qty = (int) $rawItem['quantity'];
                $productId = $rawItem['product_id'] ?? null;

                if ($productId) {
                    $product = $productsById->get($productId);
                    if (! $product) {
                        throw ValidationException::withMessages([
                            "items.{$index}.product_id" => ['El producto seleccionado no existe en el catálogo.'],
                        ]);
                    }
                    $productName = $product->name;
                    $unitPrice = (float) $product->price;
                } else {
                    if (! $isPromo || empty(trim((string) ($rawItem['product_name'] ?? '')))) {
                        throw ValidationException::withMessages([
                            "items.{$index}.product_name" => ['Selecciona un producto del catálogo o indica el nombre de la promoción gratis.'],
                        ]);
                    }
                    $productName = trim((string) $rawItem['product_name']);
                    $unitPrice = 0.0;
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
                        : 'Promoción gratis';
                }

                $preparedItems[] = [
                    'product_id' => $productId,
                    'product_name' => $productName,
                    'unit_price' => $unitPrice,
                    'quantity' => $qty,
                    'is_promo' => $isPromo,
                    'promo_reason' => $promoReason,
                    'line_total' => $lineTotal,
                ];
            }

            $subtotal = round($subtotal, 2);
            $promoSavings = round($promoSavings, 2);

            // 4. Generate unique daily order number
            $todayPrefix = 'TD-' . Carbon::today()->format('Ymd') . '-';
            $todaySeq = Order::whereBetween('created_at', [
                Carbon::today()->startOfDay(),
                Carbon::today()->endOfDay(),
            ])->count() + 1;

            do {
                $orderNumber = $todayPrefix . str_pad((string) $todaySeq, 3, '0', STR_PAD_LEFT);
                $todaySeq++;
            } while (Order::where('order_number', $orderNumber)->exists());

            // 5. Create Order & Items
            $order = Order::create([
                'order_number' => $orderNumber,
                'customer_id' => $customer->id,
                'customer_address_id' => $customerAddress->id,
                'customer_name' => $customerName,
                'customer_phone' => $normalizedPhone,
                'delivery_address' => $customerAddress->address,
                'delivery_references' => $references,
                'delivery_place_id' => $placeId,
                'delivery_lat' => $lat,
                'delivery_lng' => $lng,
                'subtotal' => $subtotal,
                'promo_savings' => $promoSavings,
                'total' => $subtotal,
                'notes' => isset($data['notes']) && trim($data['notes']) !== '' ? trim($data['notes']) : null,
                'is_delivered' => false,
                'created_by' => $request->user()?->id,
            ]);

            $order->items()->createMany($preparedItems);

            return $order->load(['items', 'customer.addresses']);
        });

        return response()->json($order, 201);
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
}
