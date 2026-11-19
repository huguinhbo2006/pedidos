<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::query();

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        if ($category = trim((string) $request->query('category', ''))) {
            $query->where('category', $category);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%");
            });
        }

        $products = $query
            ->orderByDesc('is_active')
            ->orderBy('category')
            ->orderBy('name')
            ->get();

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'category' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'price' => ['required', 'numeric', 'min:0', 'max:99999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $product = Product::create([
            'name' => trim($data['name']),
            'category' => trim($data['category']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'price' => round((float) $data['price'], 2),
            'is_active' => $data['is_active'] ?? true,
        ]);

        return response()->json($product, 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'category' => ['required', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'price' => ['required', 'numeric', 'min:0', 'max:99999'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $product->update([
            'name' => trim($data['name']),
            'category' => trim($data['category']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'price' => round((float) $data['price'], 2),
            'is_active' => $data['is_active'] ?? $product->is_active,
        ]);

        return response()->json($product);
    }

    public function toggle(Product $product): JsonResponse
    {
        $product->update([
            'is_active' => ! $product->is_active,
        ]);

        return response()->json($product);
    }

    public function destroy(Product $product): JsonResponse
    {
        if ($product->orderItems()->exists()) {
            return response()->json([
                'message' => 'Este producto ya aparece en pedidos registrados. Desactívalo para ocultarlo del catálogo sin perder historial.',
            ], 409);
        }

        $product->delete();

        return response()->json(['message' => 'Producto eliminado del catálogo.']);
    }
}
