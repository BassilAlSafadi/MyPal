# MyPal — Cloud Deploy (Render + Vercel)

This deploys the **lean v1**: the Go gateway (public) + C# API, Node orchestrator,
and Go support (private), all talking to the existing **Supabase** Postgres.
NATS, Redis, MongoDB, and Python ProdBERT are omitted for v1.

```
Browser ──> Vercel (frontend) ──> Render: mypal-gateway (public)
                                      ├─> mypal-csharp   (private)  ─┐
                                      ├─> mypal-node      (private)  ├─> Supabase Postgres
                                      └─> mypal-support   (private)  ─┘
```

---

## 1. Prerequisites

- The repo pushed to GitHub: `Solly2005/MyPal` (the new code + `render.yaml` must be committed).
- A **Render** account (https://render.com) — connect your GitHub.
- Your **Supabase database password** (Dashboard → Project Settings → Database).
  Project ref: `cuwjzieetdyoxhidrhro`, region `eu-west-1`.

> ⚠️ Render's network is IPv4-only and Supabase's direct host is IPv6-only, so you
> **must** use the Supabase **connection pooler** host (not `db.<ref>.supabase.co`).

---

## 2. Get your Supabase connection strings

Supabase Dashboard → **Connect** (top bar) → **Session pooler**. Copy the host/user
from there. It looks like:

- Host: `aws-0-eu-west-1.pooler.supabase.com`
- Port: `5432`
- User: `postgres.cuwjzieetdyoxhidrhro`
- Database: `postgres`

You'll provide `POSTGRES_URL` in **two different formats** depending on the service:

**A) pgx / URI form** — for `mypal-gateway`, `mypal-support`, `mypal-node`:
```
postgres://postgres.cuwjzieetdyoxhidrhro:YOUR_DB_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**B) Npgsql keyword form** — for `mypal-csharp` only:
```
Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.cuwjzieetdyoxhidrhro;Password=YOUR_DB_PASSWORD;SSL Mode=Require;Trust Server Certificate=true
```

---

## 3. Apply the blueprint

1. Render Dashboard → **Blueprints** → **New Blueprint Instance**.
2. Select the `Solly2005/MyPal` repo. Render reads `render.yaml` and lists 4 services.
3. Fill the prompted secrets:

| Service | Key | Value |
|---|---|---|
| (group) `mypal-shared` | `JWT_SECRET` | any long random string — **same for gateway + C#** |
| mypal-gateway | `POSTGRES_URL` | format **A** above |
| mypal-gateway | `CORS_ALLOWED_ORIGINS` | leave blank for now (set in step 5) |
| mypal-csharp | `POSTGRES_URL` | format **B** above |
| mypal-csharp | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional — blank disables Google login |
| mypal-csharp | `FRONTEND_URL` | your Vercel URL (set after step 4; can edit later) |
| mypal-node | `COHERE_API_KEY` / `GEMINI_API_KEY` | optional — AI search degrades without them |
| mypal-support | `POSTGRES_URL` | format **A** above |

`INTERNAL_SERVICE_TOKEN` is auto-generated. Click **Apply**.

4. Wait for `mypal-gateway` to go live and copy its URL, e.g.
   `https://mypal-gateway.onrender.com`. Verify: open `…/health` → should say OK.

---

## 4. Deploy the frontend to Vercel

In the `Frontend/` project, set these environment variables on Vercel:

| Key | Value |
|---|---|
| `VITE_API_GATEWAY` | `https://mypal-gateway.onrender.com` (your gateway URL) |
| `VITE_SUPABASE_URL` | `https://cuwjzieetdyoxhidrhro.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (the anon key from `Frontend/.env`) |
| `VITE_ENV` | `production` |

Vercel project settings: **Root Directory = `Frontend`**, framework **Vite**
(build `npm run build`, output `dist`). The included `vercel.json` adds SPA
rewrites so client routes like `/home` and `/sell` resolve.

---

## 5. Wire CORS + OAuth back

Once you have the Vercel URL (e.g. `https://mypal.vercel.app`):

- `mypal-gateway` → set `CORS_ALLOWED_ORIGINS=https://mypal.vercel.app` → redeploy.
- `mypal-csharp` → set `FRONTEND_URL=https://mypal.vercel.app`.
- If using Google login: add `https://mypal-gateway.onrender.com/api/auth/google/callback`
  to the Google Cloud OAuth **Authorized redirect URIs**.

---

## Notes, costs & limitations

- **Cost:** private services (`pserv`) on Render require a paid plan (~$7/mo each).
  4 services ≈ **$28/mo**. To cut cost, you can change `mypal-csharp/node/support`
  from `type: pserv` to `type: web` (free plan, but each gets a public URL and
  free instances cold-start after inactivity). The gateway must stay `web`.
- **ProdBERT not deployed:** MyPal *Internal* semantic search relies on it; it will
  degrade/return fewer results. Global Agentic (web) search is unaffected.
- **No outbox/saga workers:** `MESSAGING_ENABLED=false` turns off the NATS-backed
  eventual-consistency workers. Core flows (auth, browse, search, sell, cart) work;
  the distributed order-saga reconciliation does not.
- **First request after idle** on free/cold instances can take ~30–60s to wake.
