<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Tortero;
use App\Services\WhatsAppService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TorteroController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Tortero::query()
            ->orderByDesc('is_active')
            ->orderBy('name');

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        $torteros = $query->get();

        if ($day = strtolower(trim((string) $request->query('day', '')))) {
            $torteros = $torteros->filter(fn (Tortero $t) => $t->deliversOnDay($day))->values();
        }

        return response()->json($torteros);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $tortero = Tortero::create($data);

        return response()->json($tortero, 201);
    }

    public function show(Tortero $tortero): JsonResponse
    {
        return response()->json($tortero);
    }

    public function update(Request $request, Tortero $tortero): JsonResponse
    {
        $data = $this->validatePayload($request);

        $tortero->update($data);

        return response()->json($tortero->fresh());
    }

    public function toggleActive(Tortero $tortero): JsonResponse
    {
        $tortero->update([
            'is_active' => ! $tortero->is_active,
        ]);

        return response()->json($tortero->fresh());
    }

    public function toggleSkipDate(Request $request, Tortero $tortero): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['required', 'date'],
            'skip' => ['required', 'boolean'],
        ]);

        $targetDate = Carbon::parse($validated['date'])->toDateString();

        if ($validated['skip']) {
            $tortero->update(['skipped_for_date' => $targetDate]);
        } elseif ($tortero->skipped_for_date?->toDateString() === $targetDate) {
            $tortero->update(['skipped_for_date' => null]);
        }

        return response()->json($tortero->fresh());
    }

    public function destroy(Tortero $tortero): JsonResponse
    {
        $name = $tortero->name;
        $tortero->delete();

        return response()->json([
            'message' => "Tortero '{$name}' eliminado correctamente.",
        ]);
    }

    public function sendMessages(Request $request, WhatsAppService $whatsApp): JsonResponse
    {
        $validated = $request->validate([
            'tortero_ids' => ['required', 'array', 'min:1'],
            'tortero_ids.*' => ['required', 'integer', 'exists:torteros,id'],
            'target_date' => ['nullable', 'date'],
            'device_id' => ['nullable', 'integer', 'exists:whatsapp_devices,id'],
            'message' => ['nullable', 'string', 'min:3', 'max:1500'],
        ]);

        $device = $whatsApp->resolveDevice(
            isset($validated['device_id']) ? (int) $validated['device_id'] : null
        );

        if (! $device) {
            return response()->json([
                'success' => false,
                'error' => 'No hay ningún dispositivo de WhatsApp configurado en el sistema. Vincula una línea en la sección WhatsApp.',
                'sent_count' => 0,
                'failed_count' => 0,
                'results' => [],
            ], 422);
        }

        $targetDate = ! empty($validated['target_date'])
            ? Carbon::parse($validated['target_date'])->toDateString()
            : Carbon::tomorrow()->toDateString();

        $messageTemplate = trim((string) ($validated['message'] ?? ''));
        if ($messageTemplate === '') {
            $greeting = self::greetingForHour(Carbon::now()->hour);
            $messageTemplate = "¡{$greeting}! Disculpe, ¿necesitaría tacos para el día de mañana? 🌮";
        }

        $ids = collect($validated['tortero_ids'])->map(fn ($id) => (int) $id)->unique()->values()->all();
        $torteros = Tortero::whereIn('id', $ids)->orderBy('name')->get();

        $results = [];
        $sentCount = 0;
        $failedCount = 0;
        $total = $torteros->count();

        foreach ($torteros as $index => $tortero) {
            $personalized = str_ireplace('{nombre}', $tortero->name, $messageTemplate);
            $res = $whatsApp->sendTextMessage($device, $tortero->phone, $personalized);

            if ($res['success']) {
                $sentCount++;
                $tortero->update([
                    'last_sent_for_date' => $targetDate,
                    'last_sent_at' => now(),
                    'skipped_for_date' => null,
                ]);
            } else {
                $failedCount++;
            }

            $results[] = [
                'id' => $tortero->id,
                'name' => $tortero->name,
                'phone' => $tortero->phone,
                'success' => $res['success'],
                'error' => $res['error'],
            ];

            if ($index < $total - 1 && ! app()->runningUnitTests()) {
                usleep(250000);
            }
        }

        $updatedTorteros = Tortero::whereIn('id', $ids)->orderBy('name')->get();
        $firstError = collect($results)->firstWhere('success', false)['error'] ?? null;

        return response()->json([
            'success' => $sentCount > 0,
            'message' => $sentCount > 0
                ? ($failedCount === 0
                    ? "¡Mensaje enviado exitosamente a {$sentCount} tortero(s)!"
                    : "Se envió a {$sentCount} tortero(s) y falló {$failedCount}.")
                : ($firstError ?: 'No se pudo enviar el mensaje a ningún tortero.'),
            'error' => $sentCount === 0 ? ($firstError ?: 'No se pudo enviar el mensaje.') : null,
            'sent_count' => $sentCount,
            'failed_count' => $failedCount,
            'target_date' => $targetDate,
            'device' => $device->name,
            'message_used' => $messageTemplate,
            'results' => $results,
            'updated_torteros' => $updatedTorteros,
        ], $sentCount > 0 ? 200 : 422);
    }

    public static function greetingForHour(int $hour): string
    {
        if ($hour >= 5 && $hour < 12) {
            return 'Buenos días';
        }
        if ($hour >= 12 && $hour < 19) {
            return 'Buenas tardes';
        }

        return 'Buenas noches';
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', 'string', 'min:8', 'max:30'],
            'delivery_days' => ['required', 'array', 'min:1'],
            'delivery_days.*' => ['required', 'string', Rule::in(Tortero::VALID_DAYS)],
            'notes' => ['nullable', 'string', 'max:500'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $digits = preg_replace('/\D+/', '', (string) $validated['phone']) ?? '';
        if (strlen($digits) < 8) {
            throw ValidationException::withMessages([
                'phone' => ['Ingresa un número de celular válido (al menos 8 dígitos).'],
            ]);
        }

        $selectedDays = collect($validated['delivery_days'])
            ->map(fn ($d) => strtolower((string) $d))
            ->unique()
            ->values()
            ->all();

        // Keep canonical Monday..Sunday ordering
        $orderedDays = array_values(array_filter(
            Tortero::VALID_DAYS,
            fn (string $d) => in_array($d, $selectedDays, true)
        ));

        return [
            'name' => trim((string) $validated['name']),
            'phone' => Customer::normalizePhone((string) $validated['phone']),
            'delivery_days' => $orderedDays,
            'notes' => isset($validated['notes']) && trim((string) $validated['notes']) !== ''
                ? trim((string) $validated['notes'])
                : null,
            'is_active' => $validated['is_active'] ?? true,
        ];
    }
}
