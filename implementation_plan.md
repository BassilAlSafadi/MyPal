# Database Integration Plan: MongoDB & Redis

This plan details the addition of Mongoose and ioredis to the Node environment, providing a flexible schema solution for AI product contexts and robust in-memory caching for cart and activity queues. 

## User Review Required

> [!WARNING]
> Mongoose and ioredis are primarily Node.js libraries. Since we are building these inside the `@/lib` ecosystem typical of a Next.js or Node-first service, please confirm this aligns with your deployment strategy (e.g., if you are planning to migrate Vite to an SSR-framework or use a Node API alongside it).

## Proposed Changes

### 1. Environment Configuration

#### [MODIFY] `.env` & `.env.example`
We will replace the placeholder `REDIS_HOST` with a complete `REDIS_URL` connection string and ensure `MONGO_URI` is correctly exposed.

### 2. Client Setup

We will establish connection utilities designed with "hot reload" protection (preventing connection exhaustion during active development).

#### [NEW] `src/MyPal.Frontend/src/lib/mongodb.ts`
- Singleton pattern caching the `mongoose.Connection` globally in development.
- Configured connection pooling and timeout logic.

#### [NEW] `src/MyPal.Frontend/src/lib/redis.ts`
- Initializing `ioredis` client.
- Handling `globalThis` caching to prevent Redis connection storms during hot-reloading.

### 3. Data Integration

#### [NEW] `src/MyPal.Frontend/src/lib/schemas/ProductMetadata.ts`
- Define a Mongoose schema built for ML context extraction.
- **Attributes Structure**:
  - `productId`: String (Mapped exactly to the Postgres `MYPAL_PRODUCT.id`)
  - `technicalSpecs`: `Map<String, String>` (Highly flexible key-value store natively supported by Mongo)
  - `aiSearchContext`: String (A pre-computed, optimized string blob combining all specs and categories designed to be fed into LLM prompt windows or vector embeddings)
  - `variants`: Array of mixed types

#### [NEW] `src/MyPal.Frontend/src/lib/services/RedisService.ts`
- Implementing standard Redis namespaces linked directly to Postgres `userId` constraints.
- `addToCart(userId: string, productId: string, qty: number)` -> Maps to Hash `cart:{userId}`
- `getCart(userId: string)`
- `logRecentActivity(userId: string, activityType: string, metadata: any)` -> Uses Redis Lists or ZSETs bound to `activity:{userId}` to maintain a lightning-fast queue.

### 4. Dependency Updates

We will need to install the required packages.
```bash
npm install mongoose ioredis
npm install -D @types/mongoose
```

## Open Questions

- Since the current `@/` alias points into your Vite React directory, are you handling these database connections inside serverless functions, a dedicated Express backend, or are you migrating the frontend to Next.js shortly? (I will proceed to implement them natively in the specified paths regardless!)

## Verification Plan

1. Install `mongoose` and `ioredis`.
2. Ensure both `mongodb.ts` and `redis.ts` compile securely without TypeScript errors.
3. Validate that standard environment secrets map correctly inside the clients.
