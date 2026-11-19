<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class MapsSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $dbKey = trim((string) AppSetting::getValue('google_maps_api_key', ''));
        $envKey = trim((string) config('services.google_maps.api_key', ''));
        $region = trim((string) AppSetting::getValue('google_maps_region', (string) config('services.google_maps.region', 'mx')));

        $effectiveKey = $dbKey !== '' ? $dbKey : ($envKey !== '' ? $envKey : null);
        $source = $dbKey !== '' ? 'database' : ($envKey !== '' ? 'env' : 'none');

        return response()->json([
            'has_google_maps_key' => $effectiveKey !== null,
            'api_key' => $effectiveKey,
            'region' => $region !== '' ? $region : 'mx',
            'source' => $source,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'api_key' => ['nullable', 'string', 'max:255'],
            'region' => ['nullable', 'string', 'max:10'],
        ]);

        $apiKey = isset($data['api_key']) ? trim($data['api_key']) : '';
        $region = isset($data['region']) && trim($data['region']) !== ''
            ? strtolower(trim($data['region']))
            : 'mx';

        AppSetting::setValue('google_maps_api_key', $apiKey !== '' ? $apiKey : null);
        AppSetting::setValue('google_maps_region', $region);

        return $this->show();
    }

    public function fallbackSearch(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        if (mb_strlen($query) < 3) {
            return response()->json(['results' => []]);
        }

        $region = trim((string) AppSetting::getValue('google_maps_region', (string) config('services.google_maps.region', 'mx')));

        try {
            $params = [
                'q' => $query,
                'format' => 'jsonv2',
                'addressdetails' => 1,
                'limit' => 6,
                'accept-language' => 'es',
            ];
            if ($region !== '') {
                $params['countrycodes'] = $region;
            }

            $response = Http::timeout(4)
                ->withHeaders([
                    'User-Agent' => 'TacosDoradosPOS/1.0 (contact@tacosdorados.local)',
                ])
                ->get('https://nominatim.openstreetmap.org/search', $params);

            if (! $response->successful()) {
                return response()->json(['results' => [], 'fallback_unavailable' => true]);
            }

            $items = $response->json();
            if (! is_array($items)) {
                return response()->json(['results' => []]);
            }

            $results = collect($items)->map(function (array $item) {
                $displayName = (string) ($item['display_name'] ?? '');
                $parts = array_map('trim', explode(',', $displayName));
                $mainText = $parts[0] ?? $displayName;
                $secondaryText = count($parts) > 1 ? implode(', ', array_slice($parts, 1, 3)) : '';

                return [
                    'description' => $displayName,
                    'main_text' => $mainText,
                    'secondary_text' => $secondaryText,
                    'place_id' => isset($item['place_id']) ? 'osm_' . $item['place_id'] : null,
                    'latitude' => isset($item['lat']) ? (float) $item['lat'] : null,
                    'longitude' => isset($item['lon']) ? (float) $item['lon'] : null,
                    'source' => 'nominatim',
                ];
            })->values()->all();

            return response()->json(['results' => $results]);
        } catch (\Throwable) {
            return response()->json([
                'results' => [],
                'fallback_unavailable' => true,
            ]);
        }
    }
}
