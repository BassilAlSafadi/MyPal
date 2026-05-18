/**
 * Shared Event Envelopes
 */

export interface DomainEvent<T> {
  id: string;
  type: string;
  trace_id: string;
  timestamp: string;
  payload: T;
}

export interface OrderCreatedPayload {
  order_id: string;
  buyer_id: string;
  total_amount: number;
}

export interface InventoryReservedPayload {
  order_id: string;
  reservation_id: string;
}

export interface InventoryFailedPayload {
  order_id: string;
  reason: string;
}
