# Frontend Agent Context

## Ownership Boundaries
* User interface, routing, state management, workflow polling.
* DO NOT hold canonical checkout state or bypass the Gateway for API requests.

## Coding Patterns
* React, Vite, TailwindCSS (unless otherwise specified).
* Zustand for state management (`authStore`, `searchStore`).
* Axios via `apiClient`.

## Testing Commands
* `npm install && npm run dev`

## Reliability
* Never assume eventual consistency workflows are synchronous. Use `SagaTracker.tsx` for visual polling.
* Handle auth expiration gracefully.
