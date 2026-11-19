import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, map, of, catchError } from 'rxjs';
import { ApiService } from './api.service';
import { AddressSuggestion, MapsConfig } from '../models/api.models';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    google?: any;
  }
}

export interface PlaceDetailsResult {
  address: string;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private readonly api = inject(ApiService);

  private scriptLoadPromise: Promise<boolean> | null = null;
  private loadedKey: string | null = null;

  readonly config = signal<MapsConfig | null>(null);
  readonly googleReady = signal(false);
  readonly googleError = signal<string | null>(null);

  loadConfigAndInit(forceReload = false): Promise<MapsConfig> {
    return new Promise((resolve) => {
      this.api
        .getMapsConfig()
        .pipe(
          catchError(() =>
            of<MapsConfig>({
              has_google_maps_key: Boolean(environment.googleMapsApiKey),
              api_key: environment.googleMapsApiKey || null,
              region: 'mx',
              source: environment.googleMapsApiKey ? 'env' : 'none',
            })
          )
        )
        .subscribe(async (cfg) => {
          this.config.set(cfg);
          const effectiveKey = cfg.api_key || environment.googleMapsApiKey || null;
          if (effectiveKey) {
            const ok = await this.loadGoogleScript(effectiveKey, cfg.region || 'mx', forceReload);
            this.googleReady.set(ok);
          } else {
            this.googleReady.set(false);
            this.googleError.set(null);
          }
          resolve(cfg);
        });
    });
  }

  private loadGoogleScript(apiKey: string, region: string, forceReload = false): Promise<boolean> {
    if (!forceReload && this.loadedKey === apiKey && window.google?.maps?.places) {
      return Promise.resolve(true);
    }

    if (!forceReload && this.scriptLoadPromise && this.loadedKey === apiKey) {
      return this.scriptLoadPromise;
    }

    this.loadedKey = apiKey;
    this.googleError.set(null);

    this.scriptLoadPromise = new Promise<boolean>((resolve) => {
      const existingScript = document.getElementById('google-maps-sdk');
      if (existingScript) {
        existingScript.remove();
        delete window.google;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-sdk';
      script.async = true;
      script.defer = true;
      const params = new URLSearchParams({
        key: apiKey,
        libraries: 'places',
        language: 'es',
      });
      if (region) {
        params.set('region', region);
      }
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

      script.onload = () => {
        if (window.google?.maps?.places) {
          resolve(true);
        } else {
          this.googleError.set('Google Maps cargó sin la librería Places.');
          resolve(false);
        }
      };

      script.onerror = () => {
        this.googleError.set('No se pudo cargar el script de Google Maps. Verifica tu API Key o conexión.');
        resolve(false);
      };

      document.head.appendChild(script);
    });

    return this.scriptLoadPromise;
  }

  searchAddresses(query: string): Observable<AddressSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      return of([]);
    }

    if (this.googleReady() && window.google?.maps?.places?.AutocompleteService) {
      const region = this.config()?.region || 'mx';
      const service = new window.google.maps.places.AutocompleteService();

      const request: Record<string, unknown> = {
        input: trimmed,
        language: 'es',
      };
      if (region) {
        request['componentRestrictions'] = { country: region };
      }

      return from(
        new Promise<AddressSuggestion[]>((resolve) => {
          service.getPlacePredictions(request, (predictions: any[] | null, status: string) => {
            if (status === 'OK' && Array.isArray(predictions)) {
              resolve(
                predictions.map((p) => ({
                  description: p.description,
                  main_text: p.structured_formatting?.main_text ?? p.description,
                  secondary_text: p.structured_formatting?.secondary_text ?? '',
                  place_id: p.place_id ?? null,
                  latitude: null,
                  longitude: null,
                  source: 'google' as const,
                }))
              );
              return;
            }
            if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT') {
              this.googleError.set(`Google Maps Places respondió: ${status}. Verifica tu API Key y facturación.`);
            }
            resolve([]);
          });
        })
      );
    }

    // Fallback live search when Google Maps API Key has not been configured yet
    return this.api.fallbackAddressSearch(trimmed).pipe(
      map((res) => res.results ?? []),
      catchError(() => of([]))
    );
  }

  resolveSuggestionDetails(suggestion: AddressSuggestion): Promise<PlaceDetailsResult> {
    if (
      suggestion.source === 'google' &&
      suggestion.place_id &&
      this.googleReady() &&
      window.google?.maps?.places?.PlacesService
    ) {
      return new Promise((resolve) => {
        const dummyDiv = document.createElement('div');
        const placesService = new window.google.maps.places.PlacesService(dummyDiv);
        placesService.getDetails(
          {
            placeId: suggestion.place_id,
            fields: ['formatted_address', 'geometry', 'place_id'],
            language: 'es',
          },
          (place: any, status: string) => {
            if (status === 'OK' && place) {
              const lat = place.geometry?.location?.lat?.() ?? null;
              const lng = place.geometry?.location?.lng?.() ?? null;
              resolve({
                address: place.formatted_address || suggestion.description,
                place_id: place.place_id || suggestion.place_id,
                latitude: typeof lat === 'number' ? lat : null,
                longitude: typeof lng === 'number' ? lng : null,
              });
              return;
            }
            resolve({
              address: suggestion.description,
              place_id: suggestion.place_id,
              latitude: suggestion.latitude,
              longitude: suggestion.longitude,
            });
          }
        );
      });
    }

    return Promise.resolve({
      address: suggestion.description,
      place_id: suggestion.place_id,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
  }
}
