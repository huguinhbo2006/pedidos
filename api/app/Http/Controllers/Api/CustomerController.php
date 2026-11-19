<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function byPhone(Request $request): JsonResponse
    {
        $rawPhone = (string) $request->query('phone', '');
        $normalized = Customer::normalizePhone($rawPhone);

        if ($normalized === '') {
            return response()->json([
                'found' => false,
                'normalized_phone' => '',
                'customer' => null,
                'suggestions' => [],
            ]);
        }

        $customer = Customer::with('addresses')
            ->where('phone', $normalized)
            ->first();

        $suggestions = [];
        if (! $customer && strlen($normalized) >= 3) {
            $suggestions = Customer::query()
                ->withCount('addresses')
                ->where('phone', 'like', "%{$normalized}%")
                ->orderBy('name')
                ->limit(6)
                ->get(['id', 'phone', 'name']);
        }

        return response()->json([
            'found' => $customer !== null,
            'normalized_phone' => $normalized,
            'customer' => $customer,
            'suggestions' => $suggestions,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = Customer::query()
            ->with('addresses')
            ->withCount(['orders', 'addresses']);

        if ($search = trim((string) $request->query('search', ''))) {
            $normalized = Customer::normalizePhone($search);
            $query->where(function ($q) use ($search, $normalized) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
                if ($normalized !== '') {
                    $q->orWhere('phone', 'like', "%{$normalized}%");
                }
            });
        }

        $customers = $query->orderBy('name')->get();

        return response()->json($customers);
    }

    public function show(Customer $customer): JsonResponse
    {
        $customer->load(['addresses', 'orders.items']);

        return response()->json($customer);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $customer->update([
            'name' => trim($data['name']),
            'notes' => isset($data['notes']) ? trim($data['notes']) : null,
        ]);

        return response()->json($customer->load('addresses'));
    }

    public function destroyAddress(Customer $customer, CustomerAddress $address): JsonResponse
    {
        if ($address->customer_id !== $customer->id) {
            return response()->json(['message' => 'El domicilio no pertenece al cliente indicado.'], 404);
        }

        $address->delete();

        return response()->json(['message' => 'Domicilio eliminado.']);
    }
}
