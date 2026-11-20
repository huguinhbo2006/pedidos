import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Tortero,
  TorteroBulkSendResponse,
  TorteroSendResultItem,
  WeekDayKey,
  WhatsAppDevice,
} from '../../core/models/api.models';

export const WEEK_DAYS: Array<{ key: WeekDayKey; short: string; label: string }> = [
  { key: 'monday', short: 'Lun', label: 'Lunes' },
  { key: 'tuesday', short: 'Mar', label: 'Martes' },
  { key: 'wednesday', short: 'Mié', label: 'Miércoles' },
  { key: 'thursday', short: 'Jue', label: 'Jueves' },
  { key: 'friday', short: 'Vie', label: 'Viernes' },
  { key: 'saturday', short: 'Sáb', label: 'Sábado' },
  { key: 'sunday', short: 'Dom', label: 'Domingo' },
];

const JS_DAY_TO_KEY: WeekDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

@Component({
  selector: 'app-torteros',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './torteros.component.html',
  styleUrl: './torteros.component.scss',
})
export class TorterosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly weekDays = WEEK_DAYS;
  readonly todayIso = this.computeLocalIsoDate(0);
  readonly tomorrowIso = this.computeLocalIsoDate(1);
  readonly dayAfterTomorrowIso = this.computeLocalIsoDate(2);
  readonly tomorrowDayName = this.getDayLabelForIso(this.tomorrowIso);
  readonly dayAfterTomorrowName = this.getDayLabelForIso(this.dayAfterTomorrowIso);

  readonly activeTab = signal<'messages' | 'catalog'>('messages');
  readonly loading = signal(true);
  readonly torteros = signal<Tortero[]>([]);
  readonly devices = signal<WhatsAppDevice[]>([]);

  // Dispatch / Messages Tab State
  readonly targetDate = signal<string>(this.tomorrowIso);
  readonly selectedIds = signal<number[]>([]);
  readonly extraIncludedIds = signal<number[]>([]);
  readonly messageText = signal<string>(this.buildDefaultMessage(this.tomorrowIso));
  readonly selectedDeviceId = signal<number | null>(null);
  readonly isSendingBulk = signal(false);
  readonly bulkSendResult = signal<TorteroBulkSendResponse | null>(null);

  // Catalog Tab Filters
  readonly searchQuery = signal('');
  readonly dayFilter = signal<'all' | WeekDayKey>('all');

  // Form Modal State
  readonly formModalOpen = signal(false);
  readonly editingTortero = signal<Tortero | null>(null);
  readonly formName = signal('');
  readonly formPhone = signal('');
  readonly formDays = signal<WeekDayKey[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
  readonly formNotes = signal('');
  readonly formActive = signal(true);
  readonly isSaving = signal(false);
  readonly formError = signal<string | null>(null);

  // Delete Modal State
  readonly deletingTortero = signal<Tortero | null>(null);
  readonly isDeleting = signal(false);

  readonly connectedDevices = computed(() =>
    this.devices().filter((d) => d.status === 'CONNECTED')
  );

  readonly targetDayKey = computed<WeekDayKey>(() =>
    this.getDayKeyForIso(this.targetDate())
  );

  readonly targetDayName = computed(() =>
    this.getDayLabelForIso(this.targetDate())
  );

  readonly todayDayLabel = computed(() =>
    this.getDayLabelForIso(this.todayIso)
  );

  readonly targetDayFullLabel = computed(() => {
    const iso = this.targetDate();
    const parts = iso.split('-');
    const name = this.getDayLabelForIso(iso);
    if (parts.length === 3) {
      return `${name} ${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return name;
  });

  readonly scheduledList = computed(() => {
    const dayKey = this.targetDayKey();
    const target = this.targetDate();
    const selectedSet = new Set(this.selectedIds());
    const extraSet = new Set(this.extraIncludedIds());
    const resultMap = new Map<number, TorteroSendResultItem>();
    for (const r of this.bulkSendResult()?.results ?? []) {
      resultMap.set(r.id, r);
    }

    return this.torteros()
      .filter(
        (t) =>
          t.is_active &&
          (t.delivery_days.includes(dayKey) || extraSet.has(t.id))
      )
      .map((tortero) => ({
        tortero,
        selected: selectedSet.has(tortero.id),
        isExtra: !tortero.delivery_days.includes(dayKey) && extraSet.has(tortero.id),
        sentToday: tortero.last_sent_for_date === target,
        skippedToday: tortero.skipped_for_date === target,
        lastResult: resultMap.get(tortero.id) ?? null,
      }));
  });

  readonly availableExtraTorteros = computed(() => {
    const dayKey = this.targetDayKey();
    const extraSet = new Set(this.extraIncludedIds());
    return this.torteros().filter(
      (t) => t.is_active && !t.delivery_days.includes(dayKey) && !extraSet.has(t.id)
    );
  });

  readonly selectedCountForTarget = computed(() => {
    const validIds = new Set(this.scheduledList().map((item) => item.tortero.id));
    return this.selectedIds().filter((id) => validIds.has(id)).length;
  });

  readonly filteredCatalog = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const day = this.dayFilter();

    return this.torteros().filter((t) => {
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        (t.notes ?? '').toLowerCase().includes(q);
      const matchDay = day === 'all' || t.delivery_days.includes(day);
      return matchSearch && matchDay;
    });
  });

  readonly canSaveForm = computed(() => {
    const nameOk = this.formName().trim().length >= 2;
    const phoneDigits = this.formPhone().replace(/\D+/g, '');
    return nameOk && phoneDigits.length >= 8 && this.formDays().length > 0;
  });

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading.set(true);
    this.api.getTorteros().subscribe({
      next: (list) => {
        this.torteros.set(list);
        this.recomputeDefaultSelection();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los torteros.');
      },
    });

    this.api.getWhatsAppDevices().subscribe({
      next: (res) => {
        this.devices.set(res.devices);
        const connected = res.devices.filter((d) => d.status === 'CONNECTED');
        const preferred = connected.find((d) => d.is_default) ?? connected[0] ?? null;
        this.selectedDeviceId.set(preferred ? preferred.id : null);
      },
    });
  }

  greetingInfo(): { label: string; emoji: string } {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { label: 'Buenos días', emoji: '🌅' };
    }
    if (hour >= 12 && hour < 19) {
      return { label: 'Buenas tardes', emoji: '☀️' };
    }
    return { label: 'Buenas noches', emoji: '🌙' };
  }

  buildDefaultMessage(isoDate = this.targetDate()): string {
    const { label } = this.greetingInfo();
    if (isoDate === this.tomorrowIso) {
      return `¡${label}! Disculpe, ¿necesitaría tacos para el día de mañana? 🌮`;
    }
    const dayLabel = this.getDayLabelForIso(isoDate).toLowerCase();
    return `¡${label}! Disculpe, ¿necesitaría tacos para el ${dayLabel}? 🌮`;
  }

  resetDefaultMessage(): void {
    this.messageText.set(this.buildDefaultMessage(this.targetDate()));
  }

  insertNamePlaceholder(): void {
    const current = this.messageText();
    if (current.includes('{nombre}')) return;
    this.messageText.set(`Hola {nombre}, ${current}`);
  }

  changeTargetDate(newIso: string): void {
    if (!newIso) return;
    this.targetDate.set(newIso);
    this.extraIncludedIds.set([]);
    this.bulkSendResult.set(null);
    this.recomputeDefaultSelection();
    this.messageText.set(this.buildDefaultMessage(newIso));
  }

  recomputeDefaultSelection(): void {
    const dayKey = this.targetDayKey();
    const target = this.targetDate();
    const extraSet = new Set(this.extraIncludedIds());

    const defaults = this.torteros()
      .filter(
        (t) =>
          t.is_active &&
          (t.delivery_days.includes(dayKey) || extraSet.has(t.id)) &&
          t.last_sent_for_date !== target &&
          t.skipped_for_date !== target
      )
      .map((t) => t.id);

    this.selectedIds.set(defaults);
  }

  toggleSelection(torteroId: number): void {
    this.selectedIds.update((ids) =>
      ids.includes(torteroId) ? ids.filter((id) => id !== torteroId) : [...ids, torteroId]
    );
  }

  selectAllPendingForTarget(): void {
    const target = this.targetDate();
    const pending = this.scheduledList()
      .filter((item) => item.tortero.last_sent_for_date !== target && item.tortero.skipped_for_date !== target)
      .map((item) => item.tortero.id);

    this.selectedIds.set(
      pending.length > 0 ? pending : this.scheduledList().map((item) => item.tortero.id)
    );
  }

  clearSelection(): void {
    this.selectedIds.set([]);
  }

  addExtraToTarget(torteroId: number): void {
    this.extraIncludedIds.update((ids) => (ids.includes(torteroId) ? ids : [...ids, torteroId]));
    this.selectedIds.update((ids) => (ids.includes(torteroId) ? ids : [...ids, torteroId]));
  }

  removeExtraFromTarget(torteroId: number): void {
    this.extraIncludedIds.update((ids) => ids.filter((id) => id !== torteroId));
    this.selectedIds.update((ids) => ids.filter((id) => id !== torteroId));
  }

  toggleSkipForTarget(tortero: Tortero, skip: boolean): void {
    const target = this.targetDate();
    this.api.toggleTorteroSkipDate(tortero.id, target, skip).subscribe({
      next: (updated) => {
        this.torteros.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        if (skip) {
          this.selectedIds.update((ids) => ids.filter((id) => id !== updated.id));
          this.toast.show(`${updated.name} marcado como "Ya avisó" para ${this.targetDayName()}.`, 'info');
        } else {
          this.selectedIds.update((ids) => (ids.includes(updated.id) ? ids : [...ids, updated.id]));
          this.toast.success(`${updated.name} incluido nuevamente en la lista.`);
        }
      },
      error: () => this.toast.error('No se pudo actualizar el estado del tortero.'),
    });
  }

  sendMessagesToSelected(): void {
    const validIds = new Set(this.scheduledList().map((item) => item.tortero.id));
    const torteroIds = this.selectedIds().filter((id) => validIds.has(id));
    const message = this.messageText().trim();

    if (torteroIds.length === 0 || !message || this.isSendingBulk()) return;

    this.isSendingBulk.set(true);
    this.bulkSendResult.set(null);

    this.api
      .sendTorterosMessages({
        tortero_ids: torteroIds,
        target_date: this.targetDate(),
        device_id: this.selectedDeviceId() ?? undefined,
        message,
      })
      .subscribe({
        next: (res) => {
          this.isSendingBulk.set(false);
          this.bulkSendResult.set(res);
          this.applyBulkResponseUpdates(res);
          this.toast.success(res.message);
        },
        error: (err) => {
          this.isSendingBulk.set(false);
          const payload = err?.error as TorteroBulkSendResponse | undefined;
          if (payload && Array.isArray(payload.results)) {
            this.bulkSendResult.set(payload);
            this.applyBulkResponseUpdates(payload);
            this.toast.error(payload.error || payload.message || 'No se pudieron enviar los mensajes.');
          } else {
            this.toast.error(err?.error?.message || 'Error al enviar mensajes por WhatsApp.');
          }
        },
      });
  }

  private applyBulkResponseUpdates(res: TorteroBulkSendResponse): void {
    if (res.updated_torteros?.length) {
      const updatedMap = new Map(res.updated_torteros.map((t) => [t.id, t]));
      this.torteros.update((list) => list.map((t) => updatedMap.get(t.id) ?? t));
    }

    const succeededIds = new Set(res.results.filter((r) => r.success).map((r) => r.id));
    if (succeededIds.size > 0) {
      this.selectedIds.update((ids) => ids.filter((id) => !succeededIds.has(id)));
    }
  }

  // --- CRUD Modal ---
  openCreateModal(): void {
    this.editingTortero.set(null);
    this.formName.set('');
    this.formPhone.set('');
    this.formDays.set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
    this.formNotes.set('');
    this.formActive.set(true);
    this.formError.set(null);
    this.formModalOpen.set(true);
  }

  openEditModal(tortero: Tortero): void {
    this.editingTortero.set(tortero);
    this.formName.set(tortero.name);
    this.formPhone.set(tortero.phone);
    this.formDays.set([...(tortero.delivery_days ?? [])]);
    this.formNotes.set(tortero.notes ?? '');
    this.formActive.set(tortero.is_active);
    this.formError.set(null);
    this.formModalOpen.set(true);
  }

  closeFormModal(): void {
    if (this.isSaving()) return;
    this.formModalOpen.set(false);
    this.formError.set(null);
  }

  toggleFormDay(day: WeekDayKey): void {
    this.formDays.update((days) => {
      const exists = days.includes(day);
      const next = exists ? days.filter((d) => d !== day) : [...days, day];
      return WEEK_DAYS.map((w) => w.key).filter((k) => next.includes(k));
    });
  }

  applyDayPreset(preset: 'mon_sat' | 'all' | 'weekend'): void {
    if (preset === 'all') {
      this.formDays.set(WEEK_DAYS.map((d) => d.key));
    } else if (preset === 'weekend') {
      this.formDays.set(['friday', 'saturday', 'sunday']);
    } else {
      this.formDays.set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);
    }
  }

  saveTortero(): void {
    if (this.isSaving()) return;

    const name = this.formName().trim();
    const phone = this.formPhone().trim();
    const digits = phone.replace(/\D+/g, '');
    const days = this.formDays();

    if (name.length < 2) {
      this.formError.set('Escribe el nombre del tortero (mínimo 2 caracteres).');
      return;
    }
    if (digits.length < 8) {
      this.formError.set('Ingresa un número de celular válido (al menos 8 dígitos).');
      return;
    }
    if (days.length === 0) {
      this.formError.set('Selecciona al menos un día de la semana en que pide tacos.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);

    const payload = {
      name,
      phone,
      delivery_days: days,
      notes: this.formNotes().trim() || null,
      is_active: this.formActive(),
    };

    const editing = this.editingTortero();
    const req$ = editing
      ? this.api.updateTortero(editing.id, payload)
      : this.api.createTortero(payload);

    req$.subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        this.formModalOpen.set(false);
        if (editing) {
          this.torteros.update((list) => list.map((t) => (t.id === saved.id ? saved : t)));
          this.toast.success(`Tortero "${saved.name}" actualizado.`);
        } else {
          this.torteros.update((list) => [...list, saved].sort((a, b) => a.name.localeCompare(b.name)));
          if (saved.is_active && saved.delivery_days.includes(this.targetDayKey())) {
            this.selectedIds.update((ids) => (ids.includes(saved.id) ? ids : [...ids, saved.id]));
          }
          this.toast.success(`Tortero "${saved.name}" registrado.`);
        }
      },
      error: (err) => {
        this.isSaving.set(false);
        const firstValidation = err?.error?.errors
          ? Object.values(err.error.errors).flat()[0]
          : null;
        this.formError.set(
          (firstValidation as string) ||
            err?.error?.message ||
            'No se pudo guardar el tortero.'
        );
      },
    });
  }

  toggleActive(tortero: Tortero): void {
    this.api.toggleTorteroActive(tortero.id).subscribe({
      next: (updated) => {
        this.torteros.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        if (!updated.is_active) {
          this.selectedIds.update((ids) => ids.filter((id) => id !== updated.id));
        }
        this.toast.success(updated.is_active ? `${updated.name} activado.` : `${updated.name} pausado.`);
      },
      error: () => this.toast.error('No se pudo cambiar el estado del tortero.'),
    });
  }

  openDeleteModal(tortero: Tortero): void {
    this.deletingTortero.set(tortero);
  }

  closeDeleteModal(): void {
    if (this.isDeleting()) return;
    this.deletingTortero.set(null);
  }

  confirmDelete(): void {
    const tortero = this.deletingTortero();
    if (!tortero || this.isDeleting()) return;

    this.isDeleting.set(true);
    this.api.deleteTortero(tortero.id).subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.deletingTortero.set(null);
        this.torteros.update((list) => list.filter((t) => t.id !== tortero.id));
        this.selectedIds.update((ids) => ids.filter((id) => id !== tortero.id));
        this.extraIncludedIds.update((ids) => ids.filter((id) => id !== tortero.id));
        this.toast.success(res.message || 'Tortero eliminado.');
      },
      error: () => {
        this.isDeleting.set(false);
        this.toast.error('No se pudo eliminar el tortero.');
      },
    });
  }

  // --- Helpers ---
  dayShortLabel(day: WeekDayKey): string {
    return WEEK_DAYS.find((d) => d.key === day)?.short ?? day;
  }

  formatPhone(raw?: string | null): string {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }
    return raw;
  }

  getTelUrl(phone?: string | null): string {
    if (!phone) return 'tel:';
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  }

  formatShortDate(iso?: string | null): string {
    if (!iso) return '';
    const parts = iso.substring(0, 10).split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
  }

  formatSentTime(isoTimestamp?: string | null): string {
    if (!isoTimestamp) return '';
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  private computeLocalIsoDate(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private getDayKeyForIso(iso: string): WeekDayKey {
    const parts = iso.substring(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return 'monday';
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return JS_DAY_TO_KEY[dt.getDay()];
  }

  private getDayLabelForIso(iso: string): string {
    const key = this.getDayKeyForIso(iso);
    return WEEK_DAYS.find((d) => d.key === key)?.label ?? key;
  }
}
