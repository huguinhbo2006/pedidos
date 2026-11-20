import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { WhatsAppDevice } from '../../core/models/api.models';

@Component({
  selector: 'app-whatsapp-devices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-devices.component.html',
  styleUrl: './whatsapp-devices.component.scss',
})
export class WhatsappDevicesComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly devices = signal<WhatsAppDevice[]>([]);
  readonly apiUrl = signal<string>('');

  // Modals state
  readonly connectingModalOpen = signal(false);
  readonly activeQrDevice = signal<WhatsAppDevice | null>(null);
  readonly activeQrImage = signal<string | null>(null);
  readonly activeQrStatus = signal<string>('INITIALIZING');
  readonly activeQrPhone = signal<string | null>(null);
  readonly newDeviceName = signal('');

  readonly settingsModalOpen = signal(false);
  readonly customApiUrl = signal('');

  // Test message modal state
  readonly testModalOpen = signal(false);
  readonly testTargetDevice = signal<WhatsAppDevice | null>(null);
  readonly testPhone = signal('');
  readonly testMessageText = signal('¡Hola! Este es un mensaje de prueba enviado desde Taquería Mary 🌮');
  readonly isSendingTest = signal(false);
  readonly testStatusAlert = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly deletingDevice = signal<WhatsAppDevice | null>(null);
  readonly isActionBusy = signal(false);

  // Computeds
  readonly totalConnected = computed(() =>
    this.devices().filter((d) => d.status === 'CONNECTED').length
  );

  readonly defaultDevice = computed(() =>
    this.devices().find((d) => d.is_default) ?? null
  );

  private pollIntervalId: any = null;

  ngOnInit(): void {
    this.loadDevices();
  }

  ngOnDestroy(): void {
    this.stopQrPolling();
  }

  loadDevices(silent = false): void {
    if (!silent) this.loading.set(true);

    this.api.getWhatsAppDevices().subscribe({
      next: (res) => {
        this.devices.set(res.devices);
        this.apiUrl.set(res.api_url);
        this.customApiUrl.set(res.api_url);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los dispositivos de WhatsApp.');
      },
    });
  }

  openNewDeviceModal(): void {
    this.newDeviceName.set('');
    this.activeQrDevice.set(null);
    this.activeQrImage.set(null);
    this.activeQrStatus.set('INITIALIZING');
    this.activeQrPhone.set(null);
    this.connectingModalOpen.set(true);
  }

  closeConnectingModal(): void {
    this.stopQrPolling();
    this.connectingModalOpen.set(false);
    this.activeQrDevice.set(null);
    this.loadDevices(true);
  }

  startDeviceCreation(): void {
    const name = this.newDeviceName().trim();
    if (name.length < 2) {
      this.toast.error('Escribe un nombre o alias para este dispositivo (mínimo 2 caracteres).');
      return;
    }

    this.isActionBusy.set(true);
    this.api.createWhatsAppDevice(name).subscribe({
      next: (res) => {
        this.isActionBusy.set(false);
        this.activeQrDevice.set(res.device);
        this.activeQrImage.set(res.qrImage ?? null);
        this.activeQrStatus.set(res.status ?? 'QR_READY');
        this.startQrPolling(res.device.id);
      },
      error: (err) => {
        this.isActionBusy.set(false);
        this.toast.error(err?.error?.message || 'Error al solicitar el código QR.');
      },
    });
  }

  openScanQrForExisting(device: WhatsAppDevice): void {
    this.newDeviceName.set(device.name);
    this.activeQrDevice.set(device);
    this.activeQrImage.set(null);
    this.activeQrStatus.set('INITIALIZING');
    this.activeQrPhone.set(null);
    this.connectingModalOpen.set(true);

    this.fetchQrOnce(device.id);
    this.startQrPolling(device.id);
  }

  private fetchQrOnce(deviceId: number): void {
    this.api.getWhatsAppDeviceQr(deviceId).subscribe({
      next: (res) => {
        this.activeQrStatus.set(res.status);
        this.activeQrImage.set(res.qrImage ?? null);
        if (res.status === 'CONNECTED') {
          this.activeQrPhone.set(res.phone ?? null);
          this.toast.success(`¡Dispositivo conectado! (+${res.phone || ''})`);
          this.stopQrPolling();
          this.loadDevices(true);
        }
      },
      error: () => {},
    });
  }

  private startQrPolling(deviceId: number): void {
    this.stopQrPolling();
    this.pollIntervalId = setInterval(() => {
      this.fetchQrOnce(deviceId);
    }, 2800);
  }

  private stopQrPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  syncDevice(device: WhatsAppDevice): void {
    this.isActionBusy.set(true);
    this.api.syncWhatsAppDevice(device.id).subscribe({
      next: (updated) => {
        this.isActionBusy.set(false);
        this.devices.update((list) =>
          list.map((d) => (d.id === updated.id ? updated : d))
        );
        this.toast.success(`Estado actualizado: ${updated.status === 'CONNECTED' ? 'En línea' : 'Desconectado'}`);
      },
      error: () => {
        this.isActionBusy.set(false);
        this.toast.error('No se pudo sincronizar el estado del dispositivo.');
      },
    });
  }

  makeDefault(device: WhatsAppDevice): void {
    this.isActionBusy.set(true);
    this.api.setDefaultWhatsAppDevice(device.id).subscribe({
      next: (updated) => {
        this.isActionBusy.set(false);
        this.devices.update((list) =>
          list.map((d) => ({
            ...d,
            is_default: d.id === updated.id,
          }))
        );
        this.toast.success(`'${updated.name}' ahora es la línea predeterminada.`);
      },
      error: () => {
        this.isActionBusy.set(false);
        this.toast.error('No se pudo marcar como predeterminado.');
      },
    });
  }

  openConfirmDelete(device: WhatsAppDevice): void {
    this.deletingDevice.set(device);
  }

  cancelConfirmDelete(): void {
    if (this.isActionBusy()) return;
    this.deletingDevice.set(null);
  }

  confirmDelete(): void {
    const dev = this.deletingDevice();
    if (!dev || this.isActionBusy()) return;

    this.isActionBusy.set(true);
    this.api.deleteWhatsAppDevice(dev.id).subscribe({
      next: (res) => {
        this.isActionBusy.set(false);
        this.deletingDevice.set(null);
        this.devices.update((list) => list.filter((d) => d.id !== dev.id));
        this.toast.success(res.message);
      },
      error: (err) => {
        this.isActionBusy.set(false);
        this.toast.error(err?.error?.message || 'Error al eliminar el dispositivo.');
      },
    });
  }

  openSettingsModal(): void {
    this.customApiUrl.set(this.apiUrl());
    this.settingsModalOpen.set(true);
  }

  // --- Test Message Modal Handlers ---
  openTestModal(device: WhatsAppDevice): void {
    this.testTargetDevice.set(device);
    this.testStatusAlert.set(null);
    this.testModalOpen.set(true);
  }

  closeTestModal(): void {
    if (this.isSendingTest()) return;
    this.testModalOpen.set(false);
    this.testTargetDevice.set(null);
    this.testStatusAlert.set(null);
  }

  sendTestMessage(): void {
    const dev = this.testTargetDevice();
    if (!dev) return;

    const phone = this.testPhone().trim();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      this.testStatusAlert.set({
        type: 'error',
        message: 'Por favor ingresa un número de teléfono válido (mínimo 8-10 dígitos).',
      });
      return;
    }

    const message = this.testMessageText().trim();
    if (!message) {
      this.testStatusAlert.set({
        type: 'error',
        message: 'El texto del mensaje no puede estar vacío.',
      });
      return;
    }

    this.isSendingTest.set(true);
    this.testStatusAlert.set(null);

    this.api.sendWhatsAppTestMessage(dev.id, { numero: phone, mensaje: message }).subscribe({
      next: (res) => {
        this.isSendingTest.set(false);
        this.testStatusAlert.set({
          type: 'success',
          message: res.message || '¡Mensaje entregado exitosamente a WhatsApp!',
        });
        this.toast.success('¡Mensaje enviado con éxito!');
      },
      error: (err) => {
        this.isSendingTest.set(false);
        const errMsg = err?.error?.error || err?.error?.message || 'Error al enviar el mensaje. Verifica que el dispositivo esté conectado.';
        this.testStatusAlert.set({
          type: 'error',
          message: errMsg,
        });
        this.toast.error(errMsg);
      },
    });
  }

  saveSettings(): void {
    const url = this.customApiUrl().trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.toast.error('Ingresa una URL válida comenzando con https:// o http://');
      return;
    }

    this.isActionBusy.set(true);
    this.api.updateWhatsAppSettings(url).subscribe({
      next: (res) => {
        this.isActionBusy.set(false);
        this.apiUrl.set(res.whatsapp_api_url);
        this.settingsModalOpen.set(false);
        this.toast.success(res.message);
        this.loadDevices();
      },
      error: (err) => {
        this.isActionBusy.set(false);
        this.toast.error(err?.error?.message || 'Error al guardar la URL.');
      },
    });
  }

  formatPhone(phone?: string | null): string {
    if (!phone) return 'Sin vincular';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('521')) {
      return `+52 (${clean.slice(3, 5)}) ${clean.slice(5, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return `+${clean}`;
  }
}
