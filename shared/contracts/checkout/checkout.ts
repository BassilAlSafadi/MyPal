/**
 * Shared Checkout Contracts
 */

export interface GeoSnapshot {
  lat: number;
  lng: number;
  google_place_id: string;
}

export interface VendorOrder {
  id: string;
  parent_order_id: string;
  vendor_id: string;
  status: string;
  items: Array<{
    product_id: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
}

export interface ParentOrder {
  id: string;
  buyer_id: string;
  total_amount: number;
  geo_snapshot: GeoSnapshot;
  child_orders: VendorOrder[];
  status: string;
  created_at: string;
}

export interface CheckoutRequest {
  cart_id: string;
  geo_snapshot: GeoSnapshot;
}

export interface CheckoutResponse {
  parent_order_id: string;
  status: string;
}
