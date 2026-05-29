package routing

import (
	"encoding/json"
	"net/http"
)

// swaggerSpec returns the OpenAPI 3.0 specification for the Go Gateway.
// Served at GET /swagger/doc.json; the UI is at GET /swagger/.
func swaggerSpec() map[string]any {
	bearer := map[string]any{
		"type":         "http",
		"scheme":       "bearer",
		"bearerFormat": "JWT",
		"description":  "Access token issued by POST /api/v1/auth/login",
	}

	return map[string]any{
		"openapi": "3.0.3",
		"info": map[string]any{
			"title":       "MyPal API Gateway",
			"version":     gatewayVersion,
			"description": "Go reverse-proxy gateway. Auth routes forward to the C# Main API; AI/seller routes forward to the Node LLM Orchestrator.",
		},
		"servers": []map[string]any{
			{"url": "http://localhost:8081", "description": "Local dev"},
		},
		"components": map[string]any{
			"securitySchemes": map[string]any{
				"BearerAuth": bearer,
			},
			"schemas": map[string]any{
				"APIError": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"success":  map[string]any{"type": "boolean", "example": false},
						"error":    map[string]any{"type": "object", "properties": map[string]any{"code": map[string]any{"type": "string"}, "message": map[string]any{"type": "string"}, "trace_id": map[string]any{"type": "string"}}},
					},
				},
				"LoginRequest":  map[string]any{"type": "object", "required": []string{"email", "password"}, "properties": map[string]any{"email": map[string]any{"type": "string", "format": "email"}, "password": map[string]any{"type": "string"}}},
				"SignupRequest": map[string]any{"type": "object", "required": []string{"email", "password"}, "properties": map[string]any{"email": map[string]any{"type": "string", "format": "email"}, "password": map[string]any{"type": "string"}, "name": map[string]any{"type": "string"}}},
				"AuthResponse": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"user":          map[string]any{"$ref": "#/components/schemas/UserIdentity"},
						"access_token":  map[string]any{"type": "string"},
						"refresh_token": map[string]any{"type": "string"},
						"expires_in":    map[string]any{"type": "integer"},
					},
				},
				"UserIdentity": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":         map[string]any{"type": "string", "format": "uuid"},
						"email":      map[string]any{"type": "string"},
						"username":   map[string]any{"type": "string"},
						"is_buyer":   map[string]any{"type": "boolean"},
						"is_seller":  map[string]any{"type": "boolean"},
						"roles":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						"created_at": map[string]any{"type": "string", "format": "date-time"},
						"updated_at": map[string]any{"type": "string", "format": "date-time"},
					},
				},
			},
		},
		"paths": map[string]any{
			// ── Meta ──────────────────────────────────────────────────────
			"/health": map[string]any{
				"get": map[string]any{
					"tags": []string{"Meta"}, "summary": "Gateway liveness", "security": []any{},
					"responses": map[string]any{"200": map[string]any{"description": `{"status":"ok"}`}},
				},
			},
			"/ready": map[string]any{
				"get": map[string]any{
					"tags": []string{"Meta"}, "summary": "Gateway readiness (postgres + workers)", "security": []any{},
					"responses": map[string]any{"200": map[string]any{"description": "Ready"}, "503": map[string]any{"description": "Not ready"}},
				},
			},
			"/health/dependencies": map[string]any{
				"get": map[string]any{
					"tags": []string{"Meta"}, "summary": "Upstream dependency health check", "security": []any{},
					"responses": map[string]any{"200": map[string]any{"description": "Dependency status map"}},
				},
			},
			// ── Auth (proxied → C# Main API) ─────────────────────────────
			"/api/v1/auth/signup": map[string]any{
				"post": map[string]any{
					"tags": []string{"Auth"}, "summary": "Register a new user", "security": []any{},
					"requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"$ref": "#/components/schemas/SignupRequest"}}}},
					"responses": map[string]any{"200": map[string]any{"description": "Auth payload", "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"$ref": "#/components/schemas/AuthResponse"}}}}, "400": map[string]any{"description": "Validation error"}},
				},
			},
			"/api/v1/auth/login": map[string]any{
				"post": map[string]any{
					"tags": []string{"Auth"}, "summary": "Email/password sign-in", "security": []any{},
					"requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"$ref": "#/components/schemas/LoginRequest"}}}},
					"responses": map[string]any{"200": map[string]any{"description": "Auth payload", "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"$ref": "#/components/schemas/AuthResponse"}}}}, "401": map[string]any{"description": "Invalid credentials"}},
				},
			},
			"/api/v1/auth/refresh": map[string]any{
				"post": map[string]any{
					"tags": []string{"Auth"}, "summary": "Rotate access token using httpOnly refresh cookie", "security": []any{},
					"responses": map[string]any{"200": map[string]any{"description": "New access token"}, "401": map[string]any{"description": "Invalid or expired refresh token"}},
				},
			},
			"/api/v1/auth/logout": map[string]any{
				"post": map[string]any{
					"tags": []string{"Auth"}, "summary": "Clear refresh cookie", "security": []any{},
					"responses": map[string]any{"200": map[string]any{"description": "Logged out"}},
				},
			},
			"/api/v1/auth/google/login": map[string]any{
				"get": map[string]any{
					"tags": []string{"Auth"}, "summary": "Initiate Google OAuth flow", "security": []any{},
					"responses": map[string]any{"302": map[string]any{"description": "Redirect to Google"}},
				},
			},
			// ── Users ─────────────────────────────────────────────────────
			"/api/v1/users/me": map[string]any{
				"get": map[string]any{
					"tags": []string{"Users"}, "summary": "Get current user profile",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"responses": map[string]any{"200": map[string]any{"description": "User identity"}, "401": map[string]any{"description": "Unauthorized"}},
				},
				"put": map[string]any{
					"tags": []string{"Users"}, "summary": "Update profile (name, phone, lifeTrackStory)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "properties": map[string]any{"first_name": map[string]any{"type": "string"}, "last_name": map[string]any{"type": "string"}, "phone": map[string]any{"type": "string"}, "life_track_story": map[string]any{"type": "string"}}}}}},
					"responses": map[string]any{"200": map[string]any{"description": "Updated user"}, "401": map[string]any{"description": "Unauthorized"}},
				},
			},
			"/api/v1/users/me/location": map[string]any{
				"patch": map[string]any{
					"tags": []string{"Users"}, "summary": "Update user location",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "properties": map[string]any{"google_place_id": map[string]any{"type": "string"}, "lat": map[string]any{"type": "number"}, "lng": map[string]any{"type": "number"}, "city": map[string]any{"type": "string"}, "state": map[string]any{"type": "string"}}}}}},
					"responses": map[string]any{"200": map[string]any{"description": "OK"}, "401": map[string]any{"description": "Unauthorized"}},
				},
			},
			// ── Products ──────────────────────────────────────────────────
			"/api/v1/products": map[string]any{
				"get": map[string]any{
					"tags": []string{"Products"}, "summary": "List products (paginated)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{
						{"name": "page", "in": "query", "schema": map[string]any{"type": "integer", "default": 1}},
						{"name": "pageSize", "in": "query", "schema": map[string]any{"type": "integer", "default": 20}},
						{"name": "category", "in": "query", "schema": map[string]any{"type": "string"}},
					},
					"responses": map[string]any{"200": map[string]any{"description": "Paginated product list"}, "401": map[string]any{"description": "Unauthorized"}},
				},
				"post": map[string]any{
					"tags": []string{"Products"}, "summary": "Create a product (seller only)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"responses": map[string]any{"201": map[string]any{"description": "Created product"}, "401": map[string]any{"description": "Unauthorized"}, "403": map[string]any{"description": "Seller role required"}},
				},
			},
			"/api/v1/products/{id}": map[string]any{
				"get": map[string]any{
					"tags": []string{"Products"}, "summary": "Get product by ID",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "id", "in": "path", "required": true, "schema": map[string]any{"type": "string", "format": "uuid"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Product detail"}, "404": map[string]any{"description": "Not found"}},
				},
				"put": map[string]any{
					"tags": []string{"Products"}, "summary": "Update product (seller only)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "id", "in": "path", "required": true, "schema": map[string]any{"type": "string", "format": "uuid"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Updated"}, "403": map[string]any{"description": "Forbidden"}},
				},
				"delete": map[string]any{
					"tags": []string{"Products"}, "summary": "Soft-delete product (seller only)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "id", "in": "path", "required": true, "schema": map[string]any{"type": "string", "format": "uuid"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Deleted"}, "403": map[string]any{"description": "Forbidden"}},
				},
			},
			// ── Orders ────────────────────────────────────────────────────
			"/api/v1/orders": map[string]any{
				"get": map[string]any{
					"tags": []string{"Orders"}, "summary": "List orders for current user",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"responses": map[string]any{"200": map[string]any{"description": "Order list"}, "401": map[string]any{"description": "Unauthorized"}},
				},
				"post": map[string]any{
					"tags": []string{"Orders"}, "summary": "Place a new order",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"responses": map[string]any{"201": map[string]any{"description": "Created order"}, "400": map[string]any{"description": "Bad request"}},
				},
			},
			"/api/v1/orders/{id}": map[string]any{
				"get": map[string]any{
					"tags": []string{"Orders"}, "summary": "Get order by ID",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "id", "in": "path", "required": true, "schema": map[string]any{"type": "string", "format": "uuid"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Order detail"}, "404": map[string]any{"description": "Not found"}},
				},
			},
			// ── Checkout & Sagas ──────────────────────────────────────────
			"/api/v1/checkout/orchestrate": map[string]any{
				"post": map[string]any{
					"tags": []string{"Checkout"}, "summary": "Orchestrate checkout saga",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"responses": map[string]any{"200": map[string]any{"description": "Saga started"}, "401": map[string]any{"description": "Unauthorized"}},
				},
			},
			"/api/v1/sagas/{saga_id}/status": map[string]any{
				"get": map[string]any{
					"tags": []string{"Checkout"}, "summary": "Poll saga status",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "saga_id", "in": "path", "required": true, "schema": map[string]any{"type": "string", "format": "uuid"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Saga status"}},
				},
			},
			// ── Search ────────────────────────────────────────────────────
			"/api/v1/search": map[string]any{
				"get": map[string]any{
					"tags": []string{"Search"}, "summary": "Semantic product search (GET)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"parameters": []map[string]any{{"name": "q", "in": "query", "required": true, "schema": map[string]any{"type": "string"}}},
					"responses": map[string]any{"200": map[string]any{"description": "Search results"}, "400": map[string]any{"description": "SSQL validation failed"}},
				},
				"post": map[string]any{
					"tags": []string{"Search"}, "summary": "Semantic product search (POST)",
					"security": []any{map[string]any{"BearerAuth": []string{}}},
					"requestBody": map[string]any{"required": true, "content": map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object", "required": []string{"q"}, "properties": map[string]any{"q": map[string]any{"type": "string"}}}}}},
					"responses": map[string]any{"200": map[string]any{"description": "Search results"}, "400": map[string]any{"description": "SSQL validation failed"}},
				},
			},
			// ── Agentic AI ────────────────────────────────────────────────
			"/api/v1/ai/agentic/deep-search":    agenticPost("Deep agentic search"),
			"/api/v1/ai/agentic/fast-search":    agenticPost("Fast keyword search"),
			"/api/v1/ai/agentic/translate":       agenticPost("Translate text"),
			"/api/v1/ai/agentic/summarize":       agenticPost("Summarise content"),
			"/api/v1/ai/agentic/recommend":       agenticPost("Product recommendations"),
			"/api/v1/ai/agentic/product-ask":     agenticPost("Product expert Q&A"),
			"/api/v1/ai/agentic/clean":           agenticPost("Clean scraped content"),
			"/api/v1/ai/agentic/seller-analyze":  agenticPost("Full seller analytics pipeline"),
		},
	}
}

// agenticPost returns a minimal path item for an authenticated agentic POST route.
func agenticPost(summary string) map[string]any {
	return map[string]any{
		"post": map[string]any{
			"tags":     []string{"Agentic AI"},
			"summary":  summary + " (proxied → Node Orchestrator)",
			"security": []any{map[string]any{"BearerAuth": []string{}}},
			"requestBody": map[string]any{
				"required": true,
				"content":  map[string]any{"application/json": map[string]any{"schema": map[string]any{"type": "object"}}},
			},
			"responses": map[string]any{
				"200": map[string]any{"description": "AI result"},
				"401": map[string]any{"description": "Unauthorized"},
				"500": map[string]any{"description": "Upstream error"},
			},
		},
	}
}

// RegisterSwagger mounts GET /swagger/ (UI) and GET /swagger/doc.json (spec).
func RegisterSwagger(mux *http.ServeMux) {
	spec := swaggerSpec()

	mux.HandleFunc("GET /swagger/doc.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(spec)
	})

	mux.HandleFunc("GET /swagger/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(swaggerUIHTML))
	})
}

// swaggerUIHTML is a self-contained Swagger UI page that loads from the unpkg CDN.
const swaggerUIHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MyPal Gateway — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/swagger/doc.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  </script>
</body>
</html>`
