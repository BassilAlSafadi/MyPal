'use strict';

const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const axios = require('axios');

// ── Proto loading ────────────────────────────────────────────────────────────
// Try the shared proto location first (Docker build copies it there), then fall
// back to the repo-relative path for local development.
const PROTO_CANDIDATES = [
  path.join(__dirname, '../../proto/mypal.proto'),           // local dev
  path.join(__dirname, '../../../proto/mypal.proto'),        // Docker copy
  '/proto/mypal.proto',                                      // explicit Docker mount
];

function findProto() {
  const fs = require('fs');
  for (const p of PROTO_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`mypal.proto not found; searched: ${PROTO_CANDIDATES.join(', ')}`);
}

const packageDef = protoLoader.loadSync(findProto(), {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).mypal;

// ── Self-call helpers ────────────────────────────────────────────────────────
// Every gRPC handler self-calls the Express HTTP server on the same process.
// This keeps all business logic in one place during the migration.

const HTTP_PORT = process.env.PORT || process.env.NODE_ORCHESTRATOR_PORT || 5003;
const HTTP_BASE = `http://127.0.0.1:${HTTP_PORT}`;

function getEnvelope(call) {
  const req = call.request;
  return {
    body:          req.body   || {},
    query:         req.query  || {},
    params:        req.params || {},
    user_id:       req.user_id       || '',
    user_email:    req.user_email    || '',
    user_roles:    req.user_roles    || '',
    internal_token: req.internal_token || '',
  };
}

function buildHeaders(env) {
  return {
    'Content-Type':    'application/json',
    'X-User-Id':       env.user_id,
    'X-User-Email':    env.user_email,
    'X-User-Roles':    env.user_roles,
    'X-Internal-Token': env.internal_token,
  };
}

function buildResponse(axiosResp) {
  const body = axiosResp.data ?? {};
  return {
    status: axiosResp.status,
    body: typeof body === 'object' && !Array.isArray(body)
      ? body
      : { items: body },   // wrap arrays so Struct is always an object
  };
}

function grpcCallback(callback) {
  return (err, resp) => {
    if (err) {
      callback({ code: grpc.status.INTERNAL, message: String(err.message || err) });
    } else {
      callback(null, resp);
    }
  };
}

// Build a handler that forwards to an Express route.
function forward(method, pathFn, bodyFromEnv = true) {
  return async (call, callback) => {
    try {
      const env  = getEnvelope(call);
      const url  = HTTP_BASE + (typeof pathFn === 'function' ? pathFn(env.params) : pathFn);
      const headers = buildHeaders(env);
      let resp;

      if (method === 'GET' || method === 'DELETE') {
        resp = await axios({ method, url, params: env.query, headers, validateStatus: () => true });
      } else {
        const data = bodyFromEnv ? env.body : {};
        resp = await axios({ method, url, data, params: env.query, headers, validateStatus: () => true });
      }

      callback(null, buildResponse(resp));
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  };
}

// ── Service implementations ──────────────────────────────────────────────────

const agentService = {
  Orchestrate: forward('POST', '/agent/orchestrate'),
};

const aiService = {
  DeepSearch:         forward('POST', '/ai/deep-search'),
  GetDeepSearchQuota: forward('GET',  '/ai/deep-search/quota', false),
  FastSearch:         forward('POST', '/ai/fast-search'),
  GlobalSearch:       forward('POST', '/ai/global-search'),
  GetGlobalSearchQuota: forward('GET', '/ai/global-search/quota', false),
  Translate:          forward('POST', '/ai/translate'),
  Summarize:          forward('POST', '/ai/summarize'),
  ProductAsk:         forward('POST', '/ai/product/ask'),
  CleanText:          forward('POST', '/ai/scraped/clean'),
  Recommend:          forward('POST', '/ai/recommend'),
  GetRecommendations: forward('GET',  '/ai/recommend/me', false),
};

const sellerService = {
  AnalyzeSeller:    forward('POST', '/ai/seller/analyze'),
  MapSummaries:     forward('POST', '/summaries/map'),
  ReduceSummaries:  forward('POST', '/summaries/reduce'),
  AnalyzeListing:   forward('POST', '/seller/listing/analyze'),
  GenerateReport:   forward('POST', '/seller/report/generate', false),
  GetSellerReport:  forward('GET',  (p) => `/seller-report/${p.sellerId}`, false),
};

const chatService = {
  CreateThread: forward('POST', '/ai/threads', false),
  ListThreads:  forward('GET',  '/ai/threads', false),
  GetThread:    forward('GET',  (p) => `/ai/threads/${p.id}`, false),
  DeleteThread: forward('DELETE', (p) => `/ai/threads/${p.id}`, false),
  SendMessage:  forward('POST', (p) => `/ai/threads/${p.id}/messages`),
};

const historyService = {
  GetHistory: forward('GET', (p) => `/ai/history/${p.feature}`, false),
};

// ── Server startup ───────────────────────────────────────────────────────────

function startGrpcServer(grpcPort) {
  const server = new grpc.Server();

  server.addService(proto.AgentService.service,        agentService);
  server.addService(proto.AiService.service,           aiService);
  server.addService(proto.SellerService.service,       sellerService);
  server.addService(proto.ChatService.service,         chatService);
  server.addService(proto.HistoryService.service,      historyService);

  server.bindAsync(
    `0.0.0.0:${grpcPort}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('[grpc] failed to bind:', err.message);
        return;
      }
      console.log(`[grpc] Node orchestrator gRPC listening on :${port}`);
    },
  );
}

module.exports = { startGrpcServer };
