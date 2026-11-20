<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Employee::withCount('orders')
            ->orderByDesc('is_active')
            ->orderBy('name');

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', 'string', 'min:8', 'max:30'],
            'role' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $employee = Employee::create([
            'name' => trim($validated['name']),
            'phone' => trim($validated['phone']),
            'role' => trim($validated['role'] ?? 'repartidor') ?: 'repartidor',
            'notes' => isset($validated['notes']) ? trim($validated['notes']) : null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json($employee, 201);
    }

    public function show(Employee $employee): JsonResponse
    {
        return response()->json($employee->loadCount('orders'));
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', 'string', 'min:8', 'max:30'],
            'role' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $employee->update([
            'name' => trim($validated['name']),
            'phone' => trim($validated['phone']),
            'role' => trim($validated['role'] ?? $employee->role) ?: 'repartidor',
            'notes' => array_key_exists('notes', $validated) ? trim($validated['notes'] ?? '') : $employee->notes,
            'is_active' => $validated['is_active'] ?? $employee->is_active,
        ]);

        return response()->json($employee);
    }

    public function toggleActive(Employee $employee): JsonResponse
    {
        $employee->update([
            'is_active' => !$employee->is_active,
        ]);

        return response()->json($employee);
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $name = $employee->name;
        $employee->delete();

        return response()->json([
            'message' => "Empleado '{$name}' eliminado correctamente.",
        ]);
    }
}
