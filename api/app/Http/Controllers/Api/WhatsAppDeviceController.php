<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\WhatsAppDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WhatsAppDeviceController extends Controller
{
    private function getApiUrl(): string
    {
        $saved = AppSetting::getValue('whatsapp_api_url');
        return rtrim($saved ?: env('WHATSAPP_API_URL', 'https://whatsapp-api-production-80b7.up.railway.app'), '/');
    }

    public function index(): JsonResponse
    {
        $apiUrl = $this->getApiUrl();
        $devices = WhatsAppDevice::orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        // Intentar sincronizar el estado en vivo de las sesiones con Railway si responde
        try {
            $response = Http::timeout(4)->get("{$apiUrl}/sessions");
            if ($response->successful()) {
                $remoteSessions = collect($response->json('sessions', []))->keyBy('sessionId');

                foreach ($devices as $device) {
                    $remote = $remoteSessions->get($device->session_id);
                    if ($remote) {
                        $newStatus = $remote['status'] ?? $device->status;
                        $newPhone = $remote['phone'] ?? $device->phone;
                        $newName = $remote['name'] ?? $device->profile_name;

                        if ($newStatus !== $device->status || $newPhone !== $device->phone || $newName !== $device->profile_name) {
                            $device->update([
                                'status' => $newStatus,
                                'phone' => $newPhone,
                                'profile_name' => $newName,
                                'last_connected_at' => $newStatus === 'CONNECTED' ? ($device->last_connected_at ?: now()) : $device->last_connected_at,
                            ]);
                        }
                    } else if ($device->status === 'CONNECTED') {
                        // Si en Railway ya no existe la sesión
                        $device->update(['status' => 'DISCONNECTED']);
                    }
                }
            }
        } catch (\Throwable $e) {
            // Si el servidor de Railway está temporalmente inaccesible, se devuelven los estados en caché de la BD
        }

        return response()->json([
            'devices' => $devices->fresh(),
            'api_url' => $apiUrl,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
        ]);

        $name = trim($request->input('name'));
        $slug = Str::slug($name, '_');
        if (empty($slug)) {
            $slug = 'dispositivo';
        }

        // Generar un session_id seguro y único
        do {
            $sessionId = substr($slug, 0, 40) . '_' . Str::lower(Str::random(6));
        } while (WhatsAppDevice::where('session_id', $sessionId)->exists());

        $apiUrl = $this->getApiUrl();
        $qrImage = null;
        $qrRaw = null;
        $status = 'INITIALIZING';

        // Inicializar la sesión en el microservicio de Railway
        try {
            $remoteRes = Http::timeout(10)->post("{$apiUrl}/sessions/{$sessionId}/start");
            if ($remoteRes->successful()) {
                $status = $remoteRes->json('status', 'QR_READY');
                $qrImage = $remoteRes->json('qrImage');
                $qrRaw = $remoteRes->json('qrRaw');
            }
        } catch (\Throwable $e) {
            // Continuar con creación local para que el usuario pueda reintentar
        }

        $isFirst = WhatsAppDevice::count() === 0;

        $device = WhatsAppDevice::create([
            'session_id' => $sessionId,
            'name' => $name,
            'status' => $status,
            'is_default' => $isFirst,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json([
            'device' => $device,
            'status' => $status,
            'qrImage' => $qrImage,
            'qrRaw' => $qrRaw,
            'api_url' => $apiUrl,
        ], 201);
    }

    public function getQr(WhatsAppDevice $device): JsonResponse
    {
        $apiUrl = $this->getApiUrl();

        try {
            $response = Http::timeout(8)->get("{$apiUrl}/sessions/{$device->session_id}/qr");
            if ($response->successful()) {
                $data = $response->json();
                $status = $data['status'] ?? $device->status;
                $phone = $data['phone'] ?? $device->phone;

                if ($status === 'CONNECTED') {
                    $device->update([
                        'status' => 'CONNECTED',
                        'phone' => $phone,
                        'last_connected_at' => now(),
                    ]);
                } else {
                    $device->update(['status' => $status]);
                }

                return response()->json([
                    'status' => $status,
                    'phone' => $phone,
                    'qrImage' => $data['qrImage'] ?? null,
                    'qrRaw' => $data['qrRaw'] ?? null,
                    'device' => $device->fresh(),
                ]);
            }

            return response()->json([
                'status' => 'ERROR',
                'error' => 'No se pudo obtener el QR desde el servidor de WhatsApp.',
                'device' => $device,
            ], 502);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => 'ERROR',
                'error' => 'Error de conexión con el servicio de WhatsApp en Railway: ' . $e->getMessage(),
                'device' => $device,
            ], 500);
        }
    }

    public function syncStatus(WhatsAppDevice $device): JsonResponse
    {
        $apiUrl = $this->getApiUrl();

        try {
            $response = Http::timeout(6)->get("{$apiUrl}/sessions/{$device->session_id}/status");
            if ($response->successful()) {
                $data = $response->json();
                $device->update([
                    'status' => $data['status'] ?? 'DISCONNECTED',
                    'phone' => $data['phone'] ?? $device->phone,
                    'profile_name' => $data['name'] ?? $device->profile_name,
                    'last_connected_at' => ($data['status'] ?? '') === 'CONNECTED' ? ($device->last_connected_at ?: now()) : $device->last_connected_at,
                ]);
            } else {
                $device->update(['status' => 'DISCONNECTED']);
            }
        } catch (\Throwable $e) {
            // Dejar el estado actual si no conecta
        }

        return response()->json($device->fresh());
    }

    public function setDefault(WhatsAppDevice $device): JsonResponse
    {
        WhatsAppDevice::where('id', '!=', $device->id)->update(['is_default' => false]);
        $device->update(['is_default' => true]);

        return response()->json($device);
    }

    public function destroy(WhatsAppDevice $device): JsonResponse
    {
        $apiUrl = $this->getApiUrl();
        $name = $device->name;

        // Avisar a Railway para desvincular y limpiar la sesión
        try {
            Http::timeout(6)->delete("{$apiUrl}/sessions/{$device->session_id}");
        } catch (\Throwable $e) {
            // Ignorar fallo remoto y eliminar de BD local
        }

        $wasDefault = $device->is_default;
        $device->delete();

        // Si era el predeterminado, asignar el primero restante como predeterminado
        if ($wasDefault) {
            $remaining = WhatsAppDevice::first();
            if ($remaining) {
                $remaining->update(['is_default' => true]);
            }
        }

        return response()->json([
            'message' => "Dispositivo '{$name}' desvinculado y eliminado correctamente.",
        ]);
    }

    public function getSettings(): JsonResponse
    {
        return response()->json([
            'whatsapp_api_url' => $this->getApiUrl(),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $request->validate([
            'whatsapp_api_url' => ['required', 'url', 'max:255'],
        ]);

        $url = rtrim($request->input('whatsapp_api_url'), '/');
        AppSetting::setValue('whatsapp_api_url', $url);

        return response()->json([
            'message' => 'Configuración de WhatsApp guardada exitosamente.',
            'whatsapp_api_url' => $url,
        ]);
    }

    public function testMessage(Request $request, WhatsAppDevice $device): JsonResponse
    {
        $request->validate([
            'numero' => ['required', 'string', 'min:8', 'max:25'],
            'mensaje' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        $cleanNumber = preg_replace('/\D/', '', $request->input('numero'));

        if (strlen($cleanNumber) < 8) {
            return response()->json([
                'success' => false,
                'error' => 'El número de teléfono debe tener al menos 8 dígitos.',
            ], 422);
        }

        // Si es número mexicano de 10 dígitos, formatear con lada internacional México (+52 1)
        if (strlen($cleanNumber) === 10) {
            $cleanNumber = '521' . $cleanNumber;
        } elseif (strlen($cleanNumber) === 12 && str_starts_with($cleanNumber, '52') && !str_starts_with($cleanNumber, '521')) {
            $cleanNumber = '521' . substr($cleanNumber, 2);
        }

        $mensaje = trim($request->input('mensaje'));
        $apiUrl = $this->getApiUrl();

        try {
            $response = Http::timeout(15)->post("{$apiUrl}/sessions/{$device->session_id}/send-message", [
                'numero' => $cleanNumber,
                'mensaje' => $mensaje,
            ]);

            if ($response->successful()) {
                return response()->json([
                    'success' => true,
                    'message' => '¡Mensaje de prueba enviado exitosamente!',
                    'data' => $response->json(),
                ]);
            }

            $errorMsg = $response->json('error') ?: 'El servidor de WhatsApp no pudo entregar el mensaje. Asegúrate de que el dispositivo esté conectado.';
            return response()->json([
                'success' => false,
                'error' => $errorMsg,
            ], $response->status() >= 400 && $response->status() < 500 ? $response->status() : 422);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error' => 'Error al comunicar con el microservicio de WhatsApp: ' . $e->getMessage(),
            ], 500);
        }
    }
}
