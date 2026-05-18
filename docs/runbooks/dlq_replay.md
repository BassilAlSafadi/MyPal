# DLQ Replay Procedures

**Symptoms**: Events arriving in `DLQ_*` streams (NATS).

**Procedure**:
1. Identify failure reason via Node Orchestrator's `dead_letter_events` MongoDB collection.
2. If it was a transient external API failure, initiate Replay via the ReplayManager (Go Gateway).
3. `POST /api/internal/ops/replay { "event_id": "XYZ", "target_stream": "ORDERS" }`
4. Monitor `event_replay_logs` in MongoDB to confirm success.
