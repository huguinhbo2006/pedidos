import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AddressSuggestion,
  Customer,
  CustomerPhoneLookupResponse,
  MapsConfig,
  MealPackage,
  Order,
  PackageSelectionItem,
  Product,
  Promotion,
  TodayOrdersResponse,
  WhatsAppDevice,
  WhatsAppDevicesResponse,
} from '../models/api.models';

export interface CreateOrderPayload {
  customer_phone: string;
  customer_name: string;
  customer_address_id?: number | null;
  delivery_address: string;
  delivery_references?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  delivery_place_id?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  address_label?: string | null;
  notes?: string | null;
  applied_promotion_ids?: number[];
  manual_discount_type?: 'fixed' | 'percent' | null;
  manual_discount_value?: number | null;
  manual_discount_reason?: string | null;
  items: Array<{
    item_type: 'product' | 'package' | 'promo_combo' | 'promo_custom';
    product_id?: number | null;
    package_id?: number | null;
    promotion_id?: number | null;
    product_name?: string;
    quantity: number;
    is_promo: boolean;
    promo_reason?: string | null;
    package_details?: PackageSelectionItem[] | null;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Products
  getProducts(params?: { active_only?: boolean; search?: string; category?: string }): Observable<Product[]> {
    let httpParams = new HttpParams();
    if (params?.active_only) httpParams = httpParams.set('active_only', '1');
    if (params?.search) httpParams = httpParams.set('search', params.search);
    if (params?.category) httpParams = httpParams.set('category', params.category);
    return this.http.get<Product[]>(`${this.apiUrl}/products`, { params: httpParams });
  }

  createProduct(data: Partial<Product>): Observable<Product> {
    return this.http.post<Product>(`${this.apiUrl}/products`, data);
  }

  updateProduct(id: number, data: Partial<Product>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/products/${id}`, data);
  }

  toggleProduct(id: number): Observable<Product> {
    return this.http.patch<Product>(`${this.apiUrl}/products/${id}/toggle`, {});
  }

  deleteProduct(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/products/${id}`);
  }

  // Packages
  getPackages(activeOnly = false): Observable<MealPackage[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('active_only', '1');
    return this.http.get<MealPackage[]>(`${this.apiUrl}/packages`, { params });
  }

  createPackage(data: Partial<MealPackage>): Observable<MealPackage> {
    return this.http.post<MealPackage>(`${this.apiUrl}/packages`, data);
  }

  updatePackage(id: number, data: Partial<MealPackage>): Observable<MealPackage> {
    return this.http.put<MealPackage>(`${this.apiUrl}/packages/${id}`, data);
  }

  togglePackage(id: number): Observable<MealPackage> {
    return this.http.patch<MealPackage>(`${this.apiUrl}/packages/${id}/toggle`, {});
  }

  deletePackage(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/packages/${id}`);
  }

  // Promotions
  getPromotions(activeOnly = false): Observable<Promotion[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('active_only', '1');
    return this.http.get<Promotion[]>(`${this.apiUrl}/promotions`, { params });
  }

  createPromotion(data: Partial<Promotion>): Observable<Promotion> {
    return this.http.post<Promotion>(`${this.apiUrl}/promotions`, data);
  }

  updatePromotion(id: number, data: Partial<Promotion>): Observable<Promotion> {
    return this.http.put<Promotion>(`${this.apiUrl}/promotions/${id}`, data);
  }

  togglePromotion(id: number): Observable<Promotion> {
    return this.http.patch<Promotion>(`${this.apiUrl}/promotions/${id}/toggle`, {});
  }

  deletePromotion(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/promotions/${id}`);
  }

  // Customers
  lookupCustomerByPhone(phone: string): Observable<CustomerPhoneLookupResponse> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<CustomerPhoneLookupResponse>(`${this.apiUrl}/customers/by-phone`, { params });
  }

  getCustomers(search?: string): Observable<Customer[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<Customer[]>(`${this.apiUrl}/customers`, { params });
  }

  getCustomer(id: number): Observable<Customer> {
    return this.http.get<Customer>(`${this.apiUrl}/customers/${id}`);
  }

  updateCustomer(id: number, data: { name: string; notes?: string | null }): Observable<Customer> {
    return this.http.put<Customer>(`${this.apiUrl}/customers/${id}`, data);
  }

  deleteCustomerAddress(customerId: number, addressId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.apiUrl}/customers/${customerId}/addresses/${addressId}`
    );
  }

  // Orders
  getTodayOrders(search?: string): Observable<TodayOrdersResponse> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<TodayOrdersResponse>(`${this.apiUrl}/orders/today`, { params });
  }

  getUpcomingOrders(search?: string): Observable<Order[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<Order[]>(`${this.apiUrl}/orders/upcoming`, { params });
  }

  getOrder(id: number): Observable<Order> {
    return this.http.get<Order>(`${this.apiUrl}/orders/${id}`);
  }

  getOrders(filters?: { date?: string; status?: 'all' | 'pending' | 'delivered'; search?: string }): Observable<Order[]> {
    let params = new HttpParams();
    if (filters?.date) params = params.set('date', filters.date);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.search) params = params.set('search', filters.search);
    return this.http.get<Order[]>(`${this.apiUrl}/orders`, { params });
  }

  createOrder(payload: CreateOrderPayload): Observable<Order> {
    return this.http.post<Order>(`${this.apiUrl}/orders`, payload);
  }

  updateOrder(id: number, payload: CreateOrderPayload): Observable<Order> {
    return this.http.put<Order>(`${this.apiUrl}/orders/${id}`, payload);
  }

  deleteOrder(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/orders/${id}`);
  }

  markOrderDelivered(orderId: number): Observable<{ message: string; order: Order }> {
    return this.http.patch<{ message: string; order: Order }>(
      `${this.apiUrl}/orders/${orderId}/deliver`,
      {}
    );
  }

  downloadOrderPdf(orderId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}/pdf`, {
      responseType: 'blob',
    });
  }

  // Maps Settings & Fallback Search
  getMapsConfig(): Observable<MapsConfig> {
    return this.http.get<MapsConfig>(`${this.apiUrl}/settings/maps`);
  }

  updateMapsConfig(data: { api_key: string | null; region: string }): Observable<MapsConfig> {
    return this.http.put<MapsConfig>(`${this.apiUrl}/settings/maps`, data);
  }

  fallbackAddressSearch(query: string): Observable<{ results: AddressSuggestion[]; fallback_unavailable?: boolean }> {
    const params = new HttpParams().set('q', query);
    return this.http.get<{ results: AddressSuggestion[]; fallback_unavailable?: boolean }>(
      `${this.apiUrl}/places/fallback-search`,
      { params }
    );
  }

  // WhatsApp Devices & Multi-session management
  getWhatsAppDevices(): Observable<WhatsAppDevicesResponse> {
    return this.http.get<WhatsAppDevicesResponse>(`${this.apiUrl}/whatsapp/devices`);
  }

  createWhatsAppDevice(name: string): Observable<{
    device: WhatsAppDevice;
    status: string;
    qrImage?: string;
    qrRaw?: string;
    api_url: string;
  }> {
    return this.http.post<any>(`${this.apiUrl}/whatsapp/devices`, { name });
  }

  getWhatsAppDeviceQr(deviceId: number): Observable<{
    status: string;
    phone?: string;
    qrImage?: string;
    qrRaw?: string;
    device: WhatsAppDevice;
  }> {
    return this.http.get<any>(`${this.apiUrl}/whatsapp/devices/${deviceId}/qr`);
  }

  syncWhatsAppDevice(deviceId: number): Observable<WhatsAppDevice> {
    return this.http.get<WhatsAppDevice>(`${this.apiUrl}/whatsapp/devices/${deviceId}/sync`);
  }

  setDefaultWhatsAppDevice(deviceId: number): Observable<WhatsAppDevice> {
    return this.http.patch<WhatsAppDevice>(`${this.apiUrl}/whatsapp/devices/${deviceId}/default`, {});
  }

  deleteWhatsAppDevice(deviceId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/whatsapp/devices/${deviceId}`);
  }

  updateWhatsAppSettings(apiUrl: string): Observable<{ message: string; whatsapp_api_url: string }> {
    return this.http.put<{ message: string; whatsapp_api_url: string }>(`${this.apiUrl}/whatsapp/settings`, {
      whatsapp_api_url: apiUrl,
    });
  }
}
