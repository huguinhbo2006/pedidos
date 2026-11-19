<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PromotionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Promotion::query();

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json(
            $query->orderByDesc('is_active')->orderBy('id')->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->buildPayload($this->validatePromotion($request));
        $promotion = Promotion::create($payload);

        return response()->json($promotion, 201);
    }

    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        $payload = $this->buildPayload($this->validatePromotion($request), $promotion);
        $promotion->update($payload);

        return response()->json($promotion);
    }

    public function toggle(Promotion $promotion): JsonResponse
    {
        $promotion->update([
            'is_active' => ! $promotion->is_active,
        ]);

        return response()->json($promotion);
    }

    public function destroy(Promotion $promotion): JsonResponse
    {
        $promotion->delete();

        return response()->json(['message' => 'Promoción eliminada correctamente.']);
    }

    private function validatePromotion(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:500'],
            'type' => ['sometimes', 'in:free_product,discount,fixed_price_combo'],
            'target_scope' => ['sometimes', 'in:all_packages,packages,products,order_total'],
            'applies_to_packages' => ['sometimes', 'boolean'],
            'target_package_ids' => ['nullable', 'array'],
            'target_package_ids.*' => ['integer', 'exists:packages,id'],
            'target_product_ids' => ['nullable', 'array'],
            'target_product_ids.*' => ['integer', 'exists:products,id'],
            'min_order_amount' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'min_quantity' => ['sometimes', 'integer', 'min:1', 'max:999'],
            'max_quantity' => ['sometimes', 'integer', 'min:1', 'max:999'],
            'allowed_options' => ['nullable', 'array'],
            'allowed_options.*' => ['string', 'max:150'],
            'reward_products' => ['nullable', 'array'],
            'reward_products.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'reward_products.*.label' => ['nullable', 'string', 'max:150'],
            'discount_type' => ['nullable', 'in:percent,fixed'],
            'discount_value' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'fixed_price' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'combo_items' => ['nullable', 'array'],
            'combo_items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'combo_items.*.label' => ['nullable', 'string', 'max:150'],
            'combo_items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function buildPayload(array $data, ?Promotion $existing = null): array
    {
        $type = $data['type'] ?? $existing?->type ?? 'free_product';
        $targetScope = $data['target_scope'] ?? $existing?->target_scope ?? 'all_packages';

        $rewardProducts = [];
        $allowedOptions = [];
        if ($type === 'free_product') {
            $rawRewards = $data['reward_products'] ?? [];
            $productIds = collect($rawRewards)->pluck('product_id')->filter()->unique()->values();
            $productsById = Product::whereIn('id', $productIds)->get()->keyBy('id');

            foreach ($rawRewards as $r) {
                $pid = (int) $r['product_id'];
                $product = $productsById->get($pid);
                if ($product) {
                    $rewardProducts[] = [
                        'product_id' => $product->id,
                        'label' => $product->name,
                    ];
                    $allowedOptions[] = $product->name;
                }
            }

            if (empty($allowedOptions) && ! empty($data['allowed_options'])) {
                $allowedOptions = array_values(array_filter(array_map('trim', $data['allowed_options'])));
            }
        }

        $comboItems = [];
        if ($type === 'fixed_price_combo') {
            $rawCombo = $data['combo_items'] ?? [];
            $productIds = collect($rawCombo)->pluck('product_id')->filter()->unique()->values();
            $productsById = Product::whereIn('id', $productIds)->get()->keyBy('id');

            foreach ($rawCombo as $ci) {
                $pid = (int) $ci['product_id'];
                $product = $productsById->get($pid);
                if ($product) {
                    $comboItems[] = [
                        'product_id' => $product->id,
                        'label' => $product->name,
                        'quantity' => (int) $ci['quantity'],
                    ];
                }
            }
        }

        $appliesToPackages = in_array($targetScope, ['all_packages', 'packages'], true);

        return [
            'name' => trim($data['name']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'type' => $type,
            'target_scope' => $type === 'fixed_price_combo' ? 'all_packages' : $targetScope,
            'applies_to_packages' => $type === 'fixed_price_combo' ? false : $appliesToPackages,
            'target_package_ids' => $targetScope === 'packages'
                ? array_values(array_unique(array_map('intval', $data['target_package_ids'] ?? [])))
                : null,
            'target_product_ids' => $targetScope === 'products'
                ? array_values(array_unique(array_map('intval', $data['target_product_ids'] ?? [])))
                : null,
            'min_order_amount' => isset($data['min_order_amount']) && $data['min_order_amount'] !== null
                ? round((float) $data['min_order_amount'], 2)
                : null,
            'min_quantity' => (int) ($data['min_quantity'] ?? 1),
            'max_quantity' => (int) ($data['max_quantity'] ?? ($existing?->max_quantity ?? 1)),
            'allowed_options' => $allowedOptions,
            'reward_products' => $type === 'free_product' ? $rewardProducts : null,
            'discount_type' => $type === 'discount' ? ($data['discount_type'] ?? 'percent') : null,
            'discount_value' => $type === 'discount' ? round((float) ($data['discount_value'] ?? 0), 2) : null,
            'fixed_price' => $type === 'fixed_price_combo' ? round((float) ($data['fixed_price'] ?? 0), 2) : null,
            'combo_items' => $type === 'fixed_price_combo' ? $comboItems : null,
            'is_active' => $data['is_active'] ?? ($existing?->is_active ?? true),
        ];
    }
}
