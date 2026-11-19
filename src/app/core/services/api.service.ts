import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AddressSuggestion,
  Customer,
  CustomerPhoneLookupResponse,
  MapsConfig,
  Order,
  Product,
  TodayOrdersResponse,
} from '../models/api.models';

export interface CreateOrderPayload {
  customer_phone: string;
  customer_name: string;
  customer_address_id?: number | null;
  delivery_address: string;
  delivery_references?: string | null;
  delivery_place_id?: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  address_label?: string | null;
  notes?: string | null;
  items: Array<{
    product_id: number | null;
    product_name?: string;
    quantity: number;
    is_promo: boolean;
    promo_reason?: string | null;
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

  markOrderDelivered(orderId: number): Observable<{ message: string; order: Order }> {
    return this.http.patch<{ message: string; order: Order }>(
      `${this.apiUrl}/orders/${orderId}/deliver`,
      {}
    );
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
}
