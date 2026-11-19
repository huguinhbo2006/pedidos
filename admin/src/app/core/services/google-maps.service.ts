import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Observable, from, map, of, catchError } from 'rxjs';
import { ApiService } from './api.service';
import { AddressSuggestion, MapsConfig } from '../models/api.models';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    google?: any;
    gm_authFailure?: () => void;
    [key: string]: any;
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
  private readonly ngZone = inject(NgZone);

  private scriptLoadPromise: Promise<boolean> | null = null;
  private loadedKey: string | null = null;
  private placesLib: any = null;

  readonly config = signal<MapsConfig | null>(null);
  readonly googleReady = signal(false);
  readonly googleError = signal<string | null>(null);

  async loadConfigAndInit(forceReload = false): Promise<MapsConfig> {
    if (environment.googleMapsApiKey) {
      const localCfg: MapsConfig = {
        has_google_maps_key: true,
        api_key: environment.googleMapsApiKey,
        region: 'mx',
        source: 'env',
      };
      this.config.set(localCfg);
      const ok = await this.loadGoogleScript(environment.googleMapsApiKey, 'mx', forceReload);
      this.ngZone.run(() => this.googleReady.set(ok));
      return localCfg;
    }

    return new Promise((resolve) => {
      this.api
        .getMapsConfig()
        .pipe(
          catchError(() =>
            of<MapsConfig>({
              has_google_maps_key: false,
              api_key: null,
              region: 'mx',
              source: 'none',
            })
          )
        )
        .subscribe(async (cfg) => {
          this.config.set(cfg);
          const effectiveKey = cfg.api_key || null;
          if (effectiveKey) {
            const ok = await this.loadGoogleScript(effectiveKey, cfg.region || 'mx', forceReload);
            this.ngZone.run(() => this.googleReady.set(ok));
          } else {
            this.googleReady.set(false);
            this.googleError.set(null);
          }
          resolve(cfg);
        });
    });
  }

  private hasPlacesLoaded(): boolean {
    return Boolean(this.placesLib || window.google?.maps?.places);
  }

  private getPlacesNamespace(): any {
    return window.google?.maps?.places ?? this.placesLib ?? null;
  }

  private loadGoogleScript(apiKey: string, region: string, forceReload = false): Promise<boolean> {
    if (!forceReload && this.loadedKey === apiKey && this.hasPlacesLoaded()) {
      return Promise.resolve(true);
    }

    if (!forceReload && this.scriptLoadPromise && this.loadedKey === apiKey) {
      return this.scriptLoadPromise;
    }

    this.loadedKey = apiKey;
    this.placesLib = null;
    this.googleError.set(null);

    this.scriptLoadPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean, errMsg?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        delete window[callbackName];
        if (!ok) {
          this.scriptLoadPromise = null;
        }
        this.ngZone.run(() => {
          if (errMsg) {
            this.googleError.set(errMsg);
          }
          if (!ok) {
            this.googleReady.set(false);
          }
          resolve(ok);
        });
      };

      const existingScript = document.getElementById('google-maps-sdk');
      if (existingScript) {
        existingScript.remove();
        delete window.google;
      }

      const callbackName = `__tdGoogleMapsInit_${Date.now()}`;
      const timeoutId = setTimeout(() => {
        finish(
          this.hasPlacesLoaded(),
          this.hasPlacesLoaded()
            ? undefined
            : 'Tiempo de espera agotado al inicializar Google Maps Places.'
        );
      }, 15000);

      window.gm_authFailure = () => {
        this.ngZone.run(() => {
          this.googleReady.set(false);
          this.googleError.set(
            'Google Maps rechazó la API Key (verifica permisos de "Maps JavaScript API", "Places API (New)" y restricciones HTTP).'
          );
        });
        if (!settled) {
          finish(false);
        }
      };

      window[callbackName] = async () => {
        let importErr: unknown = null;
        try {
          if (window.google?.maps?.importLibrary) {
            this.placesLib = await window.google.maps.importLibrary('places');
            await window.google.maps.importLibrary('maps');
          }
        } catch (err) {
          importErr = err;
        }

        if (this.hasPlacesLoaded()) {
          finish(true);
        } else {
          const detail = importErr instanceof Error ? ` (${importErr.message})` : '';
          finish(false, `Google Maps cargó sin la librería Places${detail}.`);
        }
      };

      const script = document.createElement('script');
      script.id = 'google-maps-sdk';
      script.async = true;
      script.defer = true;
      const params = new URLSearchParams({
        key: apiKey,
        libraries: 'places',
        language: 'es',
        loading: 'async',
        callback: callbackName,
      });
      if (region) {
        params.set('region', region);
      }
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

      script.onerror = () => {
        finish(false, 'No se pudo cargar el script de Google Maps. Verifica tu API Key o conexión.');
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

    if (this.googleReady() && this.hasPlacesLoaded()) {
      return from(this.searchGooglePlaces(trimmed));
    }

    return this.api.fallbackAddressSearch(trimmed).pipe(
      map((res) => res.results ?? []),
      catchError(() => of([]))
    );
  }

  private async searchGooglePlaces(input: string): Promise<AddressSuggestion[]> {
    const region = (this.config()?.region || 'mx').toLowerCase();
    this.ngZone.run(() => this.googleError.set(null));

    const placesNs = this.getPlacesNamespace();

    // 1. Places API (New)
    const AutocompleteSuggestion = placesNs?.AutocompleteSuggestion;
    if (AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      try {
        const req: Record<string, unknown> = {
          input,
          language: 'es',
        };
        if (region) {
          req['includedRegionCodes'] = [region];
        }

        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        if (Array.isArray(suggestions)) {
          return this.ngZone.run(() =>
            suggestions
              .map((s: any) => s?.placePrediction)
              .filter(Boolean)
              .map((pred: any) => {
                const fullText = pred.text?.text ?? pred.text?.toString?.() ?? '';
                const mainText = pred.mainText?.text ?? pred.mainText?.toString?.() ?? fullText;
                const secondaryText = pred.secondaryText?.text ?? pred.secondaryText?.toString?.() ?? '';
                return {
                  description: fullText || mainText,
                  main_text: mainText,
                  secondary_text: secondaryText,
                  place_id: pred.placeId ?? null,
                  latitude: null,
                  longitude: null,
                  source: 'google' as const,
                  placePrediction: pred,
                };
              })
          );
        }
      } catch {
        // Fall through to legacy AutocompleteService
      }
    }

    // 2. Legacy Places API (AutocompleteService)
    if (placesNs?.AutocompleteService) {
      const service = new placesNs.AutocompleteService();
      const request: Record<string, unknown> = {
        input,
        language: 'es',
      };
      if (region) {
        request['componentRestrictions'] = { country: region };
      }

      return new Promise<AddressSuggestion[]>((resolve) => {
        service.getPlacePredictions(request, (predictions: any[] | null, status: string) => {
          this.ngZone.run(() => {
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
              this.googleError.set(
                `Google Maps Places respondió: ${status}. Verifica que "Places API (New)" y "Maps JavaScript API" estén activas.`
              );
            }
            resolve([]);
          });
        });
      });
    }

    return [];
  }

  async resolveSuggestionDetails(suggestion: AddressSuggestion): Promise<PlaceDetailsResult> {
    if (suggestion.source === 'google' && this.googleReady()) {
      // Places API (New)
      if (suggestion.placePrediction?.toPlace) {
        try {
          const place = suggestion.placePrediction.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'location', 'id'] });
          return this.ngZone.run(() => {
            const lat = place.location?.lat?.() ?? null;
            const lng = place.location?.lng?.() ?? null;
            return {
              address: place.formattedAddress || suggestion.description,
              place_id: place.id || suggestion.place_id,
              latitude: typeof lat === 'number' ? lat : null,
              longitude: typeof lng === 'number' ? lng : null,
            };
          });
        } catch {
          // Fall back cleanly
        }
      }

      // Legacy PlacesService
      const placesNs = this.getPlacesNamespace();
      if (suggestion.place_id && placesNs?.PlacesService) {
        return new Promise((resolve) => {
          const dummyDiv = document.createElement('div');
          const placesService = new placesNs.PlacesService(dummyDiv);
          placesService.getDetails(
            {
              placeId: suggestion.place_id,
              fields: ['formatted_address', 'geometry', 'place_id'],
              language: 'es',
            },
            (place: any, status: string) => {
              this.ngZone.run(() => {
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
              });
            }
          );
        });
      }
    }

    return {
      address: suggestion.description,
      place_id: suggestion.place_id,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };
  }
}
