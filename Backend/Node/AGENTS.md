# Node.js Backend Agent Context

## Ownership Boundaries
* AI Workflow Orchestration, Seller metrics, MongoDB audit records.
* DO NOT interact with PostgreSQL canonical data directly for mutations (use Gateway).

## Coding Patterns
* Express.js router.
* `mongoose` for append-only audit and tracing collections.
* Fallback logic for all LLM calls (Cohere -> Gemini -> Mock).

## Testing Commands
* `npm install && npm start`

## Reliability
* Exceptions must be swallowed and formatted as failed payload responses (`{ is_valid: false }`) to protect the Gateway flow.
