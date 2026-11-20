import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Employee, WhatsAppDevice } from '../../core/models/api.models';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employees.component.html',
  styleUrl: './employees.component.scss',
})
export class EmployeesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly employees = signal<Employee[]>([]);
  readonly searchQuery = signal('');
  readonly roleFilter = signal<string>('all');
  readonly devices = signal<WhatsAppDevice[]>([]);

  // Modal Form State
  readonly formModalOpen = signal(false);
  readonly editingEmployee = signal<Employee | null>(null);
  readonly formName = signal('');
  readonly formPhone = signal('');
  readonly formRole = signal('repartidor');
  readonly formNotes = signal('');
  readonly formActive = signal(true);
  readonly isSaving = signal(false);

  // Quick WhatsApp Modal State
  readonly quickWaModalOpen = signal(false);
  readonly quickWaTarget = signal<Employee | null>(null);
  readonly quickWaMessage = signal('');
  readonly isSendingQuickWa = signal(false);
  readonly quickWaStatus = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Delete Modal State
  readonly deletingEmployee = signal<Employee | null>(null);
  readonly isDeleting = signal(false);

  // Computeds
  readonly filteredEmployees = computed(() => {
    const list = this.employees();
    const query = this.searchQuery().trim().toLowerCase();
    const role = this.roleFilter();

    return list.filter((emp) => {
      const matchSearch =
        !query ||
        emp.name.toLowerCase().includes(query) ||
        emp.phone.toLowerCase().includes(query) ||
        (emp.notes && emp.notes.toLowerCase().includes(query));

      const matchRole = role === 'all' || emp.role === role;

      return matchSearch && matchRole;
    });
  });

  readonly totalActive = computed(
    () => this.employees().filter((e) => e.is_active).length
  );

  readonly totalRepartidores = computed(
    () => this.employees().filter((e) => e.role === 'repartidor' && e.is_active).length
  );

  readonly connectedDevices = computed(
    () => this.devices().filter((d) => d.status === 'CONNECTED')
  );

  ngOnInit(): void {
    this.loadEmployees();
    this.loadDevices();
  }

  loadEmployees(): void {
    this.loading.set(true);
    this.api.getEmployees().subscribe({
      next: (data) => {
        this.employees.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar los empleados.');
      },
    });
  }

  loadDevices(): void {
    this.api.getWhatsAppDevices().subscribe({
      next: (res) => this.devices.set(res.devices),
      error: () => {},
    });
  }

  openCreateModal(): void {
    this.editingEmployee.set(null);
    this.formName.set('');
    this.formPhone.set('');
    this.formRole.set('repartidor');
    this.formNotes.set('');
    this.formActive.set(true);
    this.formModalOpen.set(true);
  }

  openEditModal(emp: Employee): void {
    this.editingEmployee.set(emp);
    this.formName.set(emp.name);
    this.formPhone.set(emp.phone);
    this.formRole.set(emp.role || 'repartidor');
    this.formNotes.set(emp.notes || '');
    this.formActive.set(emp.is_active);
    this.formModalOpen.set(true);
  }

  closeFormModal(): void {
    if (this.isSaving()) return;
    this.formModalOpen.set(false);
    this.editingEmployee.set(null);
  }

  saveEmployee(): void {
    const name = this.formName().trim();
    const phone = this.formPhone().trim();
    const cleanPhone = phone.replace(/\D/g, '');

    if (name.length < 2) {
      this.toast.error('Ingresa un nombre válido para el empleado (mínimo 2 letras).');
      return;
    }
    if (cleanPhone.length < 8) {
      this.toast.error('Ingresa un número de teléfono celular válido (mínimo 8-10 dígitos).');
      return;
    }

    const payload = {
      name,
      phone,
      role: this.formRole(),
      notes: this.formNotes().trim() || null,
      is_active: this.formActive(),
    };

    this.isSaving.set(true);
    const editing = this.editingEmployee();

    if (editing) {
      this.api.updateEmployee(editing.id, payload).subscribe({
        next: (updated) => {
          this.isSaving.set(false);
          this.employees.update((list) =>
            list.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
          );
          this.toast.success(`Empleado '${updated.name}' actualizado.`);
          this.closeFormModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.error?.message || 'Error al actualizar el empleado.');
        },
      });
    } else {
      this.api.createEmployee(payload).subscribe({
        next: (created) => {
          this.isSaving.set(false);
          this.employees.update((list) => [created, ...list]);
          this.toast.success(`Empleado '${created.name}' registrado exitosamente.`);
          this.closeFormModal();
        },
        error: (err) => {
          this.isSaving.set(false);
          this.toast.error(err?.error?.message || 'Error al registrar el empleado.');
        },
      });
    }
  }

  toggleActive(emp: Employee): void {
    this.api.toggleEmployeeActive(emp.id).subscribe({
      next: (updated) => {
        this.employees.update((list) =>
          list.map((e) => (e.id === updated.id ? { ...e, is_active: updated.is_active } : e))
        );
        this.toast.success(
          `Empleado ${updated.name} ${updated.is_active ? 'activado' : 'desactivado'}.`
        );
      },
      error: () => this.toast.error('No se pudo cambiar el estado del empleado.'),
    });
  }

  openDeleteModal(emp: Employee): void {
    this.deletingEmployee.set(emp);
  }

  cancelDelete(): void {
    if (this.isDeleting()) return;
    this.deletingEmployee.set(null);
  }

  confirmDelete(): void {
    const emp = this.deletingEmployee();
    if (!emp || this.isDeleting()) return;

    this.isDeleting.set(true);
    this.api.deleteEmployee(emp.id).subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.deletingEmployee.set(null);
        this.employees.update((list) => list.filter((e) => e.id !== emp.id));
        this.toast.success(res.message);
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.toast.error(err?.error?.message || 'Error al eliminar el empleado.');
      },
    });
  }

  // Quick WhatsApp Message to Employee
  openQuickWaModal(emp: Employee): void {
    this.quickWaTarget.set(emp);
    this.quickWaStatus.set(null);
    this.quickWaMessage.set(`Hola ${emp.name}, te escribimos de Taquería Mary.`);
    this.quickWaModalOpen.set(true);
  }

  closeQuickWaModal(): void {
    if (this.isSendingQuickWa()) return;
    this.quickWaModalOpen.set(false);
    this.quickWaTarget.set(null);
    this.quickWaStatus.set(null);
  }

  sendQuickWa(): void {
    const emp = this.quickWaTarget();
    if (!emp) return;

    const message = this.quickWaMessage().trim();
    if (!message) {
      this.toast.error('El mensaje no puede estar vacío.');
      return;
    }

    const availableDevice = this.devices().find((d) => d.status === 'CONNECTED' && d.is_default)
      || this.devices().find((d) => d.status === 'CONNECTED')
      || this.devices()[0];

    if (!availableDevice) {
      this.toast.error('No hay líneas de WhatsApp configuradas.');
      return;
    }

    this.isSendingQuickWa.set(true);
    this.quickWaStatus.set(null);

    this.api.sendWhatsAppTestMessage(availableDevice.id, {
      numero: emp.phone,
      mensaje: message,
    }).subscribe({
      next: (res) => {
        this.isSendingQuickWa.set(false);
        this.quickWaStatus.set({
          type: 'success',
          message: res.message || `Mensaje entregado a ${emp.name} por WhatsApp.`,
        });
        this.toast.success('¡WhatsApp enviado!');
      },
      error: (err) => {
        this.isSendingQuickWa.set(false);
        const errMsg = err?.error?.error || err?.error?.message || 'Error al enviar por WhatsApp.';
        this.quickWaStatus.set({
          type: 'error',
          message: errMsg,
        });
        this.toast.error(errMsg);
      },
    });
  }

  openWaWebChat(phone: string): void {
    const clean = phone.replace(/\D/g, '');
    const intl = clean.length === 10 ? `521${clean}` : clean;
    window.open(`https://wa.me/${intl}`, '_blank');
  }

  formatPhone(phone?: string | null): string {
    if (!phone) return 'Sin teléfono';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 12 && clean.startsWith('521')) {
      return `+52 (${clean.slice(3, 5)}) ${clean.slice(5, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return phone;
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'repartidor': return '🛵 Repartidor';
      case 'cocina': return '👨‍🍳 Cocina';
      case 'caja': return '💵 Caja';
      case 'mostrador': return '🌮 Mostrador';
      default: return `👤 ${role}`;
    }
  }
}
