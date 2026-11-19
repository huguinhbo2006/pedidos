import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Product } from '../../core/models/api.models';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly showModal = signal(false);
  readonly saving = signal(false);
  readonly editingProduct = signal<Product | null>(null);

  searchTerm = '';
  categoryFilter = 'Todas';

  formName = '';
  formCategory = 'Tacos Normales';
  formDescription = '';
  formPrice: number | null = 0;
  formActive = true;

  readonly presetCategories = ['Tacos Normales', 'Tacos Botaneros', 'Aguas Frescas', 'Desechables y Extras'];

  readonly categories = computed(() => {
    const unique = new Set(this.products().map((p) => p.category));
    return ['Todas', ...Array.from(unique)];
  });

  readonly filteredProducts = computed(() => {
    const term = this.searchTerm.trim().toLowerCase();
    return this.products().filter((p) => {
      const matchCat = this.categoryFilter === 'Todas' || p.category === this.categoryFilter;
      const matchTerm =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term);
      return matchCat && matchTerm;
    });
  });

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading.set(true);
    this.api.getProducts().subscribe({
      next: (list) => {
        this.products.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Error al cargar el catálogo.');
      },
    });
  }

  openCreateModal(): void {
    this.editingProduct.set(null);
    this.formName = '';
    this.formCategory = 'Tacos Normales';
    this.formDescription = '';
    this.formPrice = null;
    this.formActive = true;
    this.showModal.set(true);
  }

  openEditModal(product: Product): void {
    this.editingProduct.set(product);
    this.formName = product.name;
    this.formCategory = product.category;
    this.formDescription = product.description ?? '';
    this.formPrice = product.price;
    this.formActive = product.is_active;
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.showModal.set(false);
  }

  saveProduct(): void {
    if (!this.formName.trim() || !this.formCategory.trim() || this.formPrice === null || this.formPrice < 0) {
      this.toast.error('Completa nombre, categoría y un precio válido.');
      return;
    }

    this.saving.set(true);
    const payload = {
      name: this.formName.trim(),
      category: this.formCategory.trim(),
      description: this.formDescription.trim() || null,
      price: Number(this.formPrice),
      is_active: this.formActive,
    };

    const editing = this.editingProduct();
    const request$ = editing
      ? this.api.updateProduct(editing.id, payload)
      : this.api.createProduct(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.showModal.set(false);
        this.toast.success(editing ? 'Producto actualizado.' : 'Producto agregado al catálogo.');
        this.loadProducts();
      },
      error: () => {
        this.saving.set(false);
        this.toast.error('No se pudo guardar el producto.');
      },
    });
  }

  toggleActive(product: Product): void {
    this.api.toggleProduct(product.id).subscribe({
      next: (updated) => {
        this.products.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
        this.toast.success(
          updated.is_active ? `"${updated.name}" activado.` : `"${updated.name}" desactivado.`
        );
      },
      error: () => this.toast.error('No se pudo cambiar el estado del producto.'),
    });
  }

  deleteProduct(product: Product): void {
    if (!confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;

    this.api.deleteProduct(product.id).subscribe({
      next: () => {
        this.products.update((list) => list.filter((p) => p.id !== product.id));
        this.toast.success('Producto eliminado.');
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'No se pudo eliminar el producto.');
      },
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount ?? 0);
  }
}
