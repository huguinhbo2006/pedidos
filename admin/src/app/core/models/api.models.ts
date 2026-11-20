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

export interface PackageGroupOption {
  id?: number;
  package_group_id?: number;
  product_id: number | null;
  label: string;
  extra_price: number;
  is_active: boolean;
  sort_order?: number;
}

export interface PackageGroup {
  id?: number;
  package_id?: number;
  name: string;
  min_quantity: number;
  max_quantity: number;
  sort_order?: number;
  options: PackageGroupOption[];
}

export interface MealPackage {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  is_active: boolean;
  sort_order?: number;
  groups: PackageGroup[];
}

export type PromotionType = 'free_product' | 'discount' | 'fixed_price_combo';
export type PromotionTargetScope = 'all_packages' | 'packages' | 'products' | 'order_total';

export interface PromotionRewardProduct {
  product_id: number;
  label: string;
}

export interface PromotionComboItem {
  product_id: number;
  label: string;
  quantity: number;
}

export interface Promotion {
  id: number;
  name: string;
  description: string | null;
  type: PromotionType;
  target_scope: PromotionTargetScope;
  applies_to_packages: boolean;
  target_package_ids: number[] | null;
  target_product_ids: number[] | null;
  min_order_amount: number | null;
  min_quantity: number;
  max_quantity: number;
  allowed_options: string[];
  reward_products: PromotionRewardProduct[] | null;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  fixed_price: number | null;
  combo_items: PromotionComboItem[] | null;
  is_active: boolean;
}

export interface PackageSelectionItem {
  group_id?: number | null;
  option_id?: number | null;
  group: string;
  label: string;
  quantity: number;
  extra_price: number;
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
  package_id?: number | null;
  promotion_id?: number | null;
  item_type?: 'product' | 'package' | 'promo_combo' | 'promo_custom';
  product_name: string;
  unit_price: number;
  quantity: number;
  is_promo: boolean;
  promo_reason: string | null;
  package_details?: PackageSelectionItem[] | null;
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
  delivery_date?: string | null;
  delivery_time?: string | null;
  delivery_place_id: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  subtotal: number;
  promo_savings: number;
  promo_discount_amount: number;
  applied_promotions: Array<{
    promotion_id: number;
    name: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    discount_amount: number;
  }> | null;
  manual_discount_type: 'fixed' | 'percent' | null;
  manual_discount_value: number;
  manual_discount_amount: number;
  manual_discount_reason: string | null;
  total: number;
  notes: string | null;
  assigned_employee_id?: number | null;
  assigned_employee?: Employee | null;
  is_delivered: boolean;
  delivered_at: string | null;
  on_the_way_sent_at?: string | null;
  thank_you_sent_at?: string | null;
  created_at: string;
  items: OrderItem[];
  customer?: Customer;
}

export type OrderWhatsAppTemplate = 'confirmation' | 'on_the_way' | 'thank_you';

export interface TodayOrdersResponse {
  date: string;
  orders: Order[];
  upcoming_orders?: Order[];
  summary: {
    pending_count: number;
    delivered_count: number;
    total_orders_today: number;
    pending_amount: number;
    delivered_amount: number;
    total_sales_today: number;
    upcoming_count?: number;
    upcoming_amount?: number;
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
  placePrediction?: any;
}

export interface WhatsAppDevice {
  id: number;
  session_id: string;
  name: string;
  phone: string | null;
  profile_name: string | null;
  status: 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  is_default: boolean;
  last_connected_at: string | null;
  created_at?: string;
}

export interface WhatsAppDevicesResponse {
  devices: WhatsAppDevice[];
  api_url: string;
}

export interface Employee {
  id: number;
  name: string;
  phone: string;
  role: string;
  notes?: string | null;
  is_active: boolean;
  orders_count?: number;
  created_at?: string;
  updated_at?: string;
}

export type WeekDayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface Tortero {
  id: number;
  name: string;
  phone: string;
  delivery_days: WeekDayKey[];
  notes?: string | null;
  is_active: boolean;
  last_sent_for_date?: string | null;
  last_sent_at?: string | null;
  skipped_for_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TorteroSendResultItem {
  id: number;
  name: string;
  phone: string;
  success: boolean;
  error: string | null;
}

export interface TorteroBulkSendResponse {
  success: boolean;
  message: string;
  error?: string | null;
  sent_count: number;
  failed_count: number;
  target_date: string;
  device: string;
  message_used: string;
  results: TorteroSendResultItem[];
  updated_torteros?: Tortero[];
}
