/**
 * Shared Saga Contracts
 */

export interface SagaState {
  saga_id: string;
  workflow: string;
  status: string; // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED' | 'FAILED'
  current_step: string;
  completed_steps: string[];
  failed_step?: string;
  compensations: object[];
  updated_at: string;
}
