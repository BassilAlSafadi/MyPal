/**
 * Shared Orchestration Contracts
 */

export interface AgentExecutionTrace {
  trace_id: string;
  workflow: string;
  provider: string;
  model: string;
  latency_ms: number;
  status: string;
  reasoning_steps: object[];
  created_at: string;
}

export interface AgenticValidationLog {
  trace_id: string;
  entity_id: string;
  entity_type: string;
  validation_result: boolean;
  notes: string;
  created_at: string;
}
