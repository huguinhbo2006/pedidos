<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
            'name' => ['required', 'string', 'min:2', 'max:150'],
            'phone' => ['sometimes', 'required', 'string', 'min:7', 'max:30'],
            'notes' => ['nullable', 'string', 'max:500'],
            'sync_orders' => ['nullable', 'boolean'],
        ]);

        $normalizedPhone = $customer->phone;
        if (array_key_exists('phone', $data)) {
            $rawPhone = (string) $data['phone'];
            $digits = preg_replace('/\D+/', '', $rawPhone) ?? '';
            if (strlen($digits) < 7) {
                throw ValidationException::withMessages([
                    'phone' => ['Ingresa un número de celular válido (al menos 7 dígitos).'],
                ]);
            }

            $normalizedPhone = Customer::normalizePhone($rawPhone);

            $duplicate = Customer::where('phone', $normalizedPhone)
                ->where('id', '!=', $customer->id)
                ->first();

            if ($duplicate) {
                throw ValidationException::withMessages([
                    'phone' => ["Ya existe otro cliente ({$duplicate->name}) registrado con este número de celular."],
                ]);
            }
        }

        $cleanName = trim($data['name']);
        $cleanNotes = array_key_exists('notes', $data)
            ? (trim((string) ($data['notes'] ?? '')) ?: null)
            : $customer->notes;
        $syncOrders = array_key_exists('sync_orders', $data)
            ? (bool) $data['sync_orders']
            : true;

        DB::transaction(function () use ($customer, $cleanName, $normalizedPhone, $cleanNotes, $syncOrders) {
            $customer->update([
                'name' => $cleanName,
                'phone' => $normalizedPhone,
                'notes' => $cleanNotes,
            ]);

            if ($syncOrders) {
                $customer->orders()->update([
                    'customer_name' => $cleanName,
                    'customer_phone' => $normalizedPhone,
                ]);
            }
        });

        return response()->json(
            $customer->fresh()->load('addresses')->loadCount(['orders', 'addresses'])
        );
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
