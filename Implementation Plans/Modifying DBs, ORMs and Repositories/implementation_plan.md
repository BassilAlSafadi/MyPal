# Schema Update: Google Maps Location Fields + Order Snapshotting

## Background

The MyPal e-commerce platform is adding Google Maps-powered location data to the `users` table and snapshotting delivery addresses into the `orders` table at checkout time.  
This plan covers Go (internal models + Postgres repository scaffolding) and C# (.NET 9, EF Core + Npgsql) across the `MyPal.Infrastructure` project.

---

## Key Design Decisions

> [!IMPORTANT]
> **ERD Column Naming Asymmetry — `destination_` prefix on Orders**
>
> The ERD clearly shows that `orders` does **NOT** mirror the `users` column names 1:1. Instead, the snapshot fields use a `destination_` prefix:
> - `users.google_place_id` → `orders.destination_google_place_id`
> - `users.lat`             → `orders.destination_lat`
> - `users.lng`             → `orders.destination_lng`
> - `users.formatted_address` → `orders.destination_address`
>
> This prefix is intentional — it semantically distinguishes "where the user *is now*" from "where this specific order *was delivered to*".

> [!NOTE]
> **Why Snapshotting is Architecturally Critical ("Snapshotting" Business Logic)**
>
> Without snapshotting, an `orders.user_id` FK join at query-time would always return the user's *current* address — not their address at the time of purchase.  
> If a customer moves, every historical order would appear to have been delivered to their new address, which is:
> - **Legally incorrect** for tax/invoicing purposes
> - **Logistically wrong** for carrier/dispute records
> - **A data integrity violation** — the order record no longer represents what actually happened
>
> By copying `user.{lat, lng, google_place_id, formatted_address}` into `order.destination_{...}` at `CreateOrder` time, the delivery address becomes **immutable** and belongs entirely to the order, not to the user profile.

> [!NOTE]
> **Precision: `float64` vs `decimal`**
>
> - **Go**: `float64` gives ~15-17 significant digits of precision, which is more than sufficient for GPS coordinates (7 decimal places = ~1cm accuracy). Mapping to Postgres `numeric` via the pgx driver preserves precision correctly.
> - **C#**: Using `double` maps cleanly to Postgres `float8` OR Npgsql can map to `numeric`. However, to mirror the Postgres `numeric` type precisely (same as `wallet_balance`, `total_amount` patterns already in the codebase), we will use `[Precision(9, 6)]` on a `double?` column — matching the 6 decimal places standard for GPS coordinates. `decimal` would also work but introduces unnecessary overhead for floating-point values. We'll use `double?` with `[Column(TypeName = "numeric")]` to be explicit.

---

## Files To Change / Create

### Go Backend — `Backend/Go`

#### [MODIFY] [chat_models.go](file:///g:/MyPal/MyPal/Backend/Go/internal/models/chat_models.go) → New file alongside it

> We **add** two new model files rather than modifying `chat_models.go`. Same package, new files.

#### [NEW] `internal/models/user_models.go`
Defines the `User` struct with all location fields using `bson` + `json` snake_case tags.

#### [NEW] `internal/models/order_models.go`
Defines the `Order` struct with `destination_` prefixed snapshot fields using `bson` + `json` snake_case tags.

---

### Go Backend — Repository Layer

#### [NEW] `internal/repository/order_repository.go`
The **interface definition** lives in the base `repository` package (same pattern the user requested, mirroring how a base interface would be defined). Defines `OrderRepository` interface.

#### [NEW] `internal/repository/postgres/order_repository.go`
Concrete Postgres implementation struct + constructor + method stubs, following the exact same pattern as `mongodb/chat_repository.go` and `redis/session_repository.go`.

---

### C# Backend — `Backend/CSharp/MyPal.Infrastructure`

#### [MODIFY] [User.cs](file:///g:/MyPal/MyPal/Backend/CSharp/MyPal.Infrastructure/Data/Entities/User.cs)
Add 4 new nullable properties with correct `[Column]` and `[Precision]` attributes, inserted **before** the navigation properties block.

#### [MODIFY] [Order.cs](file:///g:/MyPal/MyPal/Backend/CSharp/MyPal.Infrastructure/Data/Entities/Order.cs)
Add 4 new nullable `destination_` snapshot properties with correct `[Column]` and `[Precision]` attributes, inserted **before** the navigation properties block.

---

## Verification Plan

### Automated
- `go vet ./...` from `Backend/Go/` — ensures model and repository files compile.
- `dotnet build` from `Backend/CSharp/` — ensures entity changes compile cleanly against EF Core + Npgsql.

### Manual
- Confirm new Go files use the correct module path (`mypal/api/go` per `go.mod`).
- Confirm C# `[Precision]` attribute import (`Microsoft.EntityFrameworkCore`) is already present via the existing `using` directives in each entity file.
- Confirm the `destination_` prefix matches the ERD exactly.
- Review the snapshotting logic comment block explaining the business rationale.
