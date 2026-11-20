<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\WhatsAppDevice;
use Illuminate\Support\Facades\Http;

class WhatsAppService
{
    public function getApiUrl(): string
    {
        $savedUrl = AppSetting::getValue('whatsapp_api_url');

        return rtrim($savedUrl ?: env('WHATSAPP_API_URL', 'https://whatsapp-api-production-80b7.up.railway.app'), '/');
    }

    public function resolveDevice(?int $deviceId = null): ?WhatsAppDevice
    {
        if ($deviceId) {
            $device = WhatsAppDevice::find($deviceId);
            if ($device) {
                return $device;
            }
        }

        return WhatsAppDevice::where('status', 'CONNECTED')->where('is_default', true)->first()
            ?: WhatsAppDevice::where('status', 'CONNECTED')->first()
            ?: WhatsAppDevice::where('is_default', true)->first()
            ?: WhatsAppDevice::first();
    }

    public function formatMexicoNumber(string $rawPhone): ?string
    {
        $cleanNumber = preg_replace('/\D/', '', $rawPhone) ?? '';
        if (strlen($cleanNumber) < 8) {
            return null;
        }

        if (strlen($cleanNumber) === 10) {
            return '521' . $cleanNumber;
        }

        if (strlen($cleanNumber) === 12 && str_starts_with($cleanNumber, '52') && ! str_starts_with($cleanNumber, '521')) {
            return '521' . substr($cleanNumber, 2);
        }

        return $cleanNumber;
    }

    /**
     * @return array{success: bool, status: int, error: ?string, data: mixed}
     */
    public function sendTextMessage(WhatsAppDevice $device, string $rawPhone, string $message): array
    {
        $formattedNumber = $this->formatMexicoNumber($rawPhone);
        if (! $formattedNumber) {
            return [
                'success' => false,
                'status' => 422,
                'error' => 'El número de teléfono debe tener al menos 8 dígitos.',
                'data' => null,
            ];
        }

        $apiUrl = $this->getApiUrl();

        try {
            $response = Http::timeout(15)->post("{$apiUrl}/sessions/{$device->session_id}/send-message", [
                'numero' => $formattedNumber,
                'mensaje' => $message,
            ]);

            if ($response->successful()) {
                return [
                    'success' => true,
                    'status' => $response->status(),
                    'error' => null,
                    'data' => $response->json(),
                ];
            }

            return [
                'success' => false,
                'status' => $response->status(),
                'error' => $response->json('error')
                    ?: 'El servidor de WhatsApp no pudo entregar el mensaje. Verifica que la línea esté conectada.',
                'data' => $response->json(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'status' => 500,
                'error' => 'Error de conexión con el servicio de WhatsApp: ' . $e->getMessage(),
                'data' => null,
            ];
        }
    }
}
