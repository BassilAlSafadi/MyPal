/**
 * Shared Reliability & DLQ Contracts
 */

export interface DeadLetterEvent {
  event_id: string;
  original_stream: string;
  failed_consumer: string;
  error_message: string;
  retry_count: number;
  payload: any;
  trace_id: string;
  timestamp: string;
}

export interface ReplayRequest {
  event_id: string;
  target_stream: string;
}
