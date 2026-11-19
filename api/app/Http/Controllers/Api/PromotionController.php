<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
        $data = $this->validatePromotion($request);

        $promotion = Promotion::create([
            'name' => trim($data['name']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'applies_to_packages' => $data['applies_to_packages'] ?? true,
            'max_quantity' => (int) ($data['max_quantity'] ?? 1),
            'allowed_options' => array_values(array_filter(array_map('trim', $data['allowed_options'] ?? []))),
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json($promotion, 201);
    }

    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        $data = $this->validatePromotion($request);

        $promotion->update([
            'name' => trim($data['name']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'applies_to_packages' => $data['applies_to_packages'] ?? $promotion->applies_to_packages,
            'max_quantity' => (int) ($data['max_quantity'] ?? $promotion->max_quantity),
            'allowed_options' => array_values(array_filter(array_map('trim', $data['allowed_options'] ?? []))),
            'is_active' => $data['is_active'] ?? $promotion->is_active,
        ]);

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
            'applies_to_packages' => ['sometimes', 'boolean'],
            'max_quantity' => ['required', 'integer', 'min:1', 'max:500'],
            'allowed_options' => ['nullable', 'array'],
            'allowed_options.*' => ['string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
