# CSharp Backend Agent Context

## Ownership Boundaries
* Canonical System-of-Record, Identity, Entity Framework Migrations.
* DO NOT manage high-volume logs, AI traces, or workflow execution states directly in EF (except `SagaStates` and `OutboxEvents`).

## Coding Patterns
* MediatR for internal domain routing (if applied).
* EF Core code-first migrations.
* Strict nullability and type alignment with PostgreSQL schemas.

## Testing Commands
* `dotnet build MyPal.API/MyPal.API.csproj`
* `dotnet ef migrations add ...`

## Reliability
* Write strictly to `OutboxEvents` for asynchronous external propagation.
