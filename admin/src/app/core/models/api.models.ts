export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerAddress {
  id: number;
  customer_id: number;
  label: string | null;
  address: string;
  references: string | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  last_used_at: string | null;
  created_at?: string;
}

export interface Customer {
  id: number;
  phone: string;
  name: string;
  notes?: string | null;
  addresses?: CustomerAddress[];
  orders_count?: number;
  addresses_count?: number;
  created_at?: string;
}

export interface CustomerPhoneLookupResponse {
  found: boolean;
  normalized_phone: string;
  customer: Customer | null;
  suggestions: Array<{
    id: number;
    phone: string;
    name: string;
    addresses_count: number;
  }>;
}

export interface OrderItem {
  id?: number;
  order_id?: number;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  is_promo: boolean;
  promo_reason: string | null;
  line_total: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  customer_address_id: number | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_references: string | null;
  delivery_place_id: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  subtotal: number;
  promo_savings: number;
  total: number;
  notes: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
  created_at: string;
  items: OrderItem[];
  customer?: Customer;
}

export interface TodayOrdersResponse {
  date: string;
  orders: Order[];
  summary: {
    pending_count: number;
    delivered_count: number;
    total_orders_today: number;
    pending_amount: number;
    delivered_amount: number;
    total_sales_today: number;
  };
}

export interface MapsConfig {
  has_google_maps_key: boolean;
  api_key: string | null;
  region: string;
  source: 'database' | 'env' | 'none';
}

export interface AddressSuggestion {
  description: string;
  main_text: string;
  secondary_text: string;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'google' | 'nominatim';
}
