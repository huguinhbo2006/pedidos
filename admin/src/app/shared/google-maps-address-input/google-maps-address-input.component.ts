import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { GoogleMapsService } from '../../core/services/google-maps.service';
import { AddressSuggestion } from '../../core/models/api.models';

export interface SelectedAddressPayload {
  address: string;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

@Component({
  selector: 'app-google-maps-address-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './google-maps-address-input.component.html',
  styleUrl: './google-maps-address-input.component.scss',
})
export class GoogleMapsAddressInputComponent implements OnInit, OnChanges, OnDestroy {
  readonly mapsService = inject(GoogleMapsService);
  private readonly ngZone = inject(NgZone);

  @Input() address = '';
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() placeId: string | null = null;
  @Input() placeholder = 'Escribe calle, número, colonia o punto de referencia...';

  @Output() addressChange = new EventEmitter<SelectedAddressPayload>();

  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  queryText = '';
  readonly suggestions = signal<AddressSuggestion[]>([]);
  readonly searching = signal(false);
  readonly dropdownOpen = signal(false);

  private readonly search$ = new Subject<string>();
  private sub?: Subscription;
  private mapInstance: any = null;
  private markerInstance: any = null;

  ngOnInit(): void {
    this.queryText = this.address || '';

    this.sub = this.search$
      .pipe(
        debounceTime(280),
        distinctUntilChanged(),
        tap((q) => {
          if (q.trim().length >= 3) {
            this.searching.set(true);
          } else {
            this.searching.set(false);
            this.suggestions.set([]);
            this.dropdownOpen.set(false);
          }
        }),
        switchMap((q) => this.mapsService.searchAddresses(q))
      )
      .subscribe((results) => {
        this.ngZone.run(() => {
          this.searching.set(false);
          this.suggestions.set(results);
          this.dropdownOpen.set(results.length > 0);
        });
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['address'] && !changes['address'].firstChange) {
      if (this.address !== this.queryText) {
        this.queryText = this.address || '';
      }
    }
    if ((changes['latitude'] || changes['longitude']) && this.latitude != null && this.longitude != null) {
      setTimeout(() => this.renderMapPin(this.latitude!, this.longitude!), 50);
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onInputChange(value: string): void {
    this.queryText = value;
    this.addressChange.emit({
      address: value,
      place_id: null,
      latitude: null,
      longitude: null,
    });
    this.search$.next(value);
  }

  onFocus(): void {
    if (this.suggestions().length > 0) {
      this.dropdownOpen.set(true);
    }
  }

  closeDropdownDelayed(): void {
    setTimeout(() => this.dropdownOpen.set(false), 200);
  }

  async selectSuggestion(suggestion: AddressSuggestion): Promise<void> {
    this.dropdownOpen.set(false);

    // Immediate selection so UI updates instantly even before details fetch completes
    const initialAddress = suggestion.description || suggestion.main_text;
    this.queryText = initialAddress;
    this.addressChange.emit({
      address: initialAddress,
      place_id: suggestion.place_id,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });

    this.searching.set(true);
    try {
      const details = await this.mapsService.resolveSuggestionDetails(suggestion);
      this.ngZone.run(() => {
        this.searching.set(false);
        this.queryText = details.address || initialAddress;
        this.addressChange.emit({
          address: details.address || initialAddress,
          place_id: details.place_id ?? suggestion.place_id,
          latitude: details.latitude,
          longitude: details.longitude,
        });

        if (details.latitude != null && details.longitude != null) {
          setTimeout(() => this.renderMapPin(details.latitude!, details.longitude!), 40);
        }
      });
    } catch {
      this.ngZone.run(() => this.searching.set(false));
    }
  }

  private renderMapPin(lat: number, lng: number): void {
    if (!this.mapsService.googleReady() || !window.google?.maps || !this.mapContainer?.nativeElement) {
      return;
    }

    const position = { lat, lng };
    if (!this.mapInstance) {
      this.mapInstance = new window.google.maps.Map(this.mapContainer.nativeElement, {
        center: position,
        zoom: 16,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      this.markerInstance = new window.google.maps.Marker({
        position,
        map: this.mapInstance,
        draggable: true,
        title: 'Ubicación de entrega',
      });

      this.markerInstance.addListener('dragend', () => {
        const pos = this.markerInstance.getPosition();
        if (pos) {
          this.ngZone.run(() => {
            this.addressChange.emit({
              address: this.queryText,
              place_id: this.placeId,
              latitude: pos.lat(),
              longitude: pos.lng(),
            });
          });
        }
      });
    } else {
      this.mapInstance.setCenter(position);
      this.mapInstance.setZoom(16);
      this.markerInstance?.setPosition(position);
    }
  }

  get externalMapsLink(): string | null {
    if (this.latitude != null && this.longitude != null) {
      return `https://www.google.com/maps/search/?api=1&query=${this.latitude},${this.longitude}`;
    }
    if (this.queryText.trim().length > 4) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.queryText.trim())}`;
    }
    return null;
  }
}
