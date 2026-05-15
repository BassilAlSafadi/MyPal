# Stuck Saga Recovery

**Symptoms**: User stuck on "Processing" state. Backend logs show `saga_states` stuck in `PROCESSING`.

**Procedure**:
1. Check `reconciliation_worker` logs. It should automatically transition >10m sagas to `FAILED`.
2. If the worker is down, restart the Go Gateway pod containing the worker.
3. If manual intervention is required, query PostgreSQL:
   `UPDATE saga_states SET status = 'FAILED' WHERE saga_id = 'XYZ';`
4. The compensation engine will pick up the `FAILED` state on the next worker cycle.
