<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Package;
use App\Models\PackageGroup;
use App\Models\PackageGroupOption;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PackageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Package::query()->with(['groups.options']);

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        $packages = $query
            ->orderByDesc('is_active')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($packages);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePackage($request);

        $package = DB::transaction(function () use ($data) {
            $pkg = Package::create([
                'name' => trim($data['name']),
                'description' => isset($data['description']) ? trim($data['description']) : null,
                'base_price' => round((float) $data['base_price'], 2),
                'is_active' => $data['is_active'] ?? true,
                'sort_order' => (int) ($data['sort_order'] ?? 0),
            ]);

            $this->syncGroups($pkg, $data['groups'] ?? []);

            return $pkg->load('groups.options');
        });

        return response()->json($package, 201);
    }

    public function update(Request $request, Package $package): JsonResponse
    {
        $data = $this->validatePackage($request);

        $updated = DB::transaction(function () use ($package, $data) {
            $package->update([
                'name' => trim($data['name']),
                'description' => isset($data['description']) ? trim($data['description']) : null,
                'base_price' => round((float) $data['base_price'], 2),
                'is_active' => $data['is_active'] ?? $package->is_active,
                'sort_order' => (int) ($data['sort_order'] ?? $package->sort_order),
            ]);

            $package->groups()->delete();
            $this->syncGroups($package, $data['groups'] ?? []);

            return $package->load('groups.options');
        });

        return response()->json($updated);
    }

    public function toggle(Package $package): JsonResponse
    {
        $package->update([
            'is_active' => ! $package->is_active,
        ]);

        return response()->json($package->load('groups.options'));
    }

    public function destroy(Package $package): JsonResponse
    {
        if ($package->orderItems()->exists()) {
            return response()->json([
                'message' => 'Este paquete ya tiene pedidos registrados. Desactívalo para ocultarlo sin perder historial.',
            ], 409);
        }

        $package->delete();

        return response()->json(['message' => 'Paquete eliminado correctamente.']);
    }

    private function validatePackage(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:500'],
            'base_price' => ['required', 'numeric', 'min:0', 'max:999999'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
            'groups' => ['required', 'array', 'min:1'],
            'groups.*.name' => ['required', 'string', 'max:150'],
            'groups.*.min_quantity' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'groups.*.max_quantity' => ['required', 'integer', 'min:1', 'max:9999'],
            'groups.*.options' => ['required', 'array', 'min:1'],
            'groups.*.options.*.product_id' => ['nullable', 'integer', 'exists:products,id'],
            'groups.*.options.*.label' => ['required', 'string', 'max:150'],
            'groups.*.options.*.extra_price' => ['sometimes', 'numeric', 'min:0', 'max:99999'],
            'groups.*.options.*.is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function syncGroups(Package $package, array $groups): void
    {
        foreach ($groups as $gIndex => $rawGroup) {
            $group = PackageGroup::create([
                'package_id' => $package->id,
                'name' => trim($rawGroup['name']),
                'min_quantity' => (int) ($rawGroup['min_quantity'] ?? 0),
                'max_quantity' => (int) $rawGroup['max_quantity'],
                'sort_order' => $gIndex + 1,
            ]);

            foreach ($rawGroup['options'] as $oIndex => $rawOption) {
                PackageGroupOption::create([
                    'package_group_id' => $group->id,
                    'product_id' => $rawOption['product_id'] ?? null,
                    'label' => trim($rawOption['label']),
                    'extra_price' => round((float) ($rawOption['extra_price'] ?? 0), 2),
                    'is_active' => $rawOption['is_active'] ?? true,
                    'sort_order' => $oIndex + 1,
                ]);
            }
        }
    }
}
