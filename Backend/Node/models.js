const mongoose = require('mongoose');

const agentExecutionTraceSchema = new mongoose.Schema({
  trace_id: { type: String, required: true, index: true },
  workflow: { type: String, required: true },
  provider: { type: String, required: true },
  model: { type: String, required: true },
  latency_ms: { type: Number, required: true },
  status: { type: String, required: true },
  reasoning_steps: [{ type: mongoose.Schema.Types.Mixed }],
  created_at: { type: Date, default: Date.now }
});

const agenticValidationLogSchema = new mongoose.Schema({
  trace_id: { type: String, required: true, index: true },
  entity_id: { type: String, required: true },
  entity_type: { type: String, required: true },
  validation_result: { type: Boolean, required: true },
  notes: { type: String },
  created_at: { type: Date, default: Date.now }
});

const workflowExecutionLogSchema = new mongoose.Schema({
  trace_id: { type: String, required: true, index: true },
  workflow_name: { type: String, required: true },
  state: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now }
});

const checkoutSagaLogSchema = new mongoose.Schema({
  trace_id: { type: String, required: true, index: true },
  saga_id: { type: String, required: true },
  step: { type: String, required: true },
  status: { type: String, required: true },
  error: { type: String },
  created_at: { type: Date, default: Date.now }
});

const inventoryReservationLogSchema = new mongoose.Schema({
  trace_id: { type: String, required: true, index: true },
  reservation_id: { type: String, required: true },
  items: [{ type: mongoose.Schema.Types.Mixed }],
  status: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

// Phase 4 Forensic Logs
const deadLetterEventSchema = new mongoose.Schema({
  event_id: { type: String, required: true, index: true },
  original_stream: { type: String, required: true },
  failed_consumer: { type: String, required: true },
  error_message: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  trace_id: { type: String },
  created_at: { type: Date, default: Date.now }
});

const eventReplayLogSchema = new mongoose.Schema({
  event_id: { type: String, required: true, index: true },
  target_stream: { type: String, required: true },
  replayed_by: { type: String },
  status: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const consumerFailureLogSchema = new mongoose.Schema({
  event_id: { type: String, index: true },
  consumer_name: { type: String, required: true },
  error: { type: String, required: true },
  trace_id: { type: String },
  created_at: { type: Date, default: Date.now }
});

const compensationExecutionLogSchema = new mongoose.Schema({
  saga_id: { type: String, required: true, index: true },
  step: { type: String, required: true },
  action: { type: String, required: true },
  status: { type: String, required: true },
  error: { type: String },
  trace_id: { type: String },
  created_at: { type: Date, default: Date.now }
});

const reconciliationLogSchema = new mongoose.Schema({
  job_name: { type: String, required: true },
  records_processed: { type: Number, default: 0 },
  anomalies_detected: { type: Number, default: 0 },
  actions_taken: [{ type: String }],
  status: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = {
  AgentExecutionTrace: mongoose.model('AgentExecutionTrace', agentExecutionTraceSchema),
  AgenticValidationLog: mongoose.model('AgenticValidationLog', agenticValidationLogSchema),
  WorkflowExecutionLog: mongoose.model('WorkflowExecutionLog', workflowExecutionLogSchema),
  CheckoutSagaLog: mongoose.model('CheckoutSagaLog', checkoutSagaLogSchema),
  InventoryReservationLog: mongoose.model('InventoryReservationLog', inventoryReservationLogSchema),
  DeadLetterEvent: mongoose.model('DeadLetterEvent', deadLetterEventSchema),
  EventReplayLog: mongoose.model('EventReplayLog', eventReplayLogSchema),
  ConsumerFailureLog: mongoose.model('ConsumerFailureLog', consumerFailureLogSchema),
  CompensationExecutionLog: mongoose.model('CompensationExecutionLog', compensationExecutionLogSchema),
  ReconciliationLog: mongoose.model('ReconciliationLog', reconciliationLogSchema)
};
