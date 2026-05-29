/**
 * OpenAPI 3.0 specification for the MyPal LLM Orchestrator.
 * Mounted at GET /swagger by index.js.
 */
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'MyPal LLM Orchestrator',
    version: '2.0.0',
    description:
      'Internal Node.js service that executes AI/LLM workflows. ' +
      'All routes are reached through the Go Gateway — direct calls require X-Internal-Token.',
  },
  // No hardcoded servers — Swagger UI uses the host it was loaded from.
  // This makes it work in both local dev and GitHub Codespaces automatically.
  components: {
    securitySchemes: {
      InternalToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Internal-Token',
        description: 'INTERNAL_SERVICE_TOKEN shared secret',
      },
    },
    schemas: {
      TraceId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-...' },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          trace_id: { $ref: '#/components/schemas/TraceId' },
        },
      },
    },
  },
  security: [{ InternalToken: [] }],
  paths: {
    '/': {
      get: {
        tags: ['Meta'],
        summary: 'Service info',
        security: [],
        responses: {
          200: { description: 'Service metadata and endpoint list' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Meta'],
        summary: 'Liveness check',
        security: [],
        responses: { 200: { description: '{ status: "ok" }' } },
      },
    },
    '/agent/orchestrate': {
      post: {
        tags: ['Agentic'],
        summary: 'Run the full MyPal agentic workflow',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  workflow: { type: 'string' },
                  payload: { type: 'object' },
                  user_location: { type: 'string' },
                  user_persona_bio: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Workflow result with reasoning trace' },
          500: { description: 'Workflow error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/ai/deep-search': {
      post: {
        tags: ['AI Features'],
        summary: 'Deep agentic product search',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } } } } } },
        responses: { 200: { description: 'Search results and state' }, 500: { description: 'Error' } },
      },
    },
    '/ai/fast-search': {
      post: {
        tags: ['AI Features'],
        summary: 'Fast keyword product search',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  internal_products: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Fast search result' }, 500: { description: 'Error' } },
      },
    },
    '/ai/translate': {
      post: {
        tags: ['AI Features'],
        summary: 'Translate text to a target language',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['target_language', 'text'], properties: { target_language: { type: 'string', example: 'ar' }, text: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Translated text' }, 500: { description: 'Error' } },
      },
    },
    '/ai/summarize': {
      post: {
        tags: ['AI Features'],
        summary: 'Summarize a block of text',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, length: { type: 'string', enum: ['short', 'medium', 'long'], default: 'medium' } } } } },
        },
        responses: { 200: { description: 'Summary' }, 500: { description: 'Error' } },
      },
    },
    '/ai/product/ask': {
      post: {
        tags: ['AI Features'],
        summary: 'Ask a product expert question',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { question: { type: 'string' }, product_data: { type: 'object' }, persona: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Expert answer' }, 500: { description: 'Error' } },
      },
    },
    '/ai/scraped/clean': {
      post: {
        tags: ['AI Features'],
        summary: 'Clean and normalise raw scraped text',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { raw_text: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Cleaned text' }, 500: { description: 'Error' } },
      },
    },
    '/ai/recommend': {
      post: {
        tags: ['AI Features'],
        summary: 'Generate personalised product recommendations',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { persona: { type: 'string' }, catalog: { type: 'array', items: { type: 'object' } } } } } },
        },
        responses: { 200: { description: 'Recommendations' }, 500: { description: 'Error' } },
      },
    },
    '/ai/seller/analyze': {
      post: {
        tags: ['Seller Analytics'],
        summary: 'Full seller analytics pipeline (map + reduce)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['products'], properties: { products: { type: 'array', items: { type: 'object' } } } } } },
        },
        responses: { 200: { description: 'Seller analytics result' }, 400: { description: 'products array required' }, 500: { description: 'Error' } },
      },
    },
    '/summaries/map': {
      post: {
        tags: ['Seller Analytics'],
        summary: 'Map phase — summarise individual products',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['products'], properties: { products: { type: 'array', items: { type: 'object' } } } } } },
        },
        responses: { 200: { description: 'Product summary profiles' }, 400: { description: 'Bad request' }, 500: { description: 'Error' } },
      },
    },
    '/summaries/reduce': {
      post: {
        tags: ['Seller Analytics'],
        summary: 'Reduce phase — collapse profiles to seller identity',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['profiles'], properties: { profiles: { type: 'array', items: { type: 'object' } }, sellerId: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Seller report + optional DB record' }, 400: { description: 'Bad request' }, 500: { description: 'Error' } },
      },
    },
    '/seller/listing/analyze': {
      post: {
        tags: ['Seller Workflows'],
        summary: 'Validate a product listing for completeness and policy',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, price: { type: 'number' }, listing_id: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Validation result with suggestions and flags' }, 500: { description: 'Error' } },
      },
    },
    '/seller/report/generate': {
      post: {
        tags: ['Seller Workflows'],
        summary: 'Generate a seller PDF report (stub)',
        responses: { 200: { description: 'Report URL and summary' } },
      },
    },
    '/seller-report/{sellerId}': {
      get: {
        tags: ['Seller Workflows'],
        summary: 'Fetch latest seller performance summary',
        parameters: [{ name: 'sellerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Seller performance summary' }, 404: { description: 'Not found' }, 500: { description: 'Error' } },
      },
    },
  },
};

module.exports = spec;
