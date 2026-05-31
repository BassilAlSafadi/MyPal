# MyPal — Koyeb Deploy (free, no credit card)

## Sign up
https://app.koyeb.com/signup — email only, no credit card.

---

## Service 1: mypal-gateway

- **Source**: GitHub → Solly2005/MyPal
- **Branch**: deploy/render-vercel
- **Build type**: Dockerfile
- **Root directory**: Backend/Go
- **Dockerfile**: Dockerfile.gateway
- **Port**: 10000
- **Health check path**: /health

### Environment variables (paste all at once):
```
MESSAGING_ENABLED=false
INTERNAL_SERVICE_TOKEN=mypal-internal-dev-token
JWT_SECRET=dev-local-secret-change-in-production-min-32-chars
JWT_REFRESH_SECRET=dev-local-refresh-secret-change-in-production-32c
POSTGRES_URL=postgresql://postgres.cuwjzieetdyoxhidrhro:1QaZ%23wE_070718042005@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
CORS_ALLOWED_ORIGINS=https://mypal-eta.vercel.app
NODE_ORCHESTRATOR_URL=http://localhost:5003
PRODBERT_URL=http://localhost:8001
GO_SUPPORT_URL=http://localhost:5001
```
> Set CSHARP_MAIN_API_URL **after** C# service is deployed (step 2).

---

## Service 2: mypal-csharp

- **Source**: GitHub → Solly2005/MyPal
- **Branch**: deploy/render-vercel
- **Build type**: Dockerfile
- **Root directory**: Backend/CSharp
- **Dockerfile**: MyPal.API/Dockerfile
- **Port**: 8080
- **Health check path**: /

### Environment variables:
```
JWT_SECRET=dev-local-secret-change-in-production-min-32-chars
JWT_REFRESH_SECRET=dev-local-refresh-secret-change-in-production-32c
SESSION_SECRET=dev-session-secret-change-me-please-32chars
POSTGRES_SESSION_URL=Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.cuwjzieetdyoxhidrhro;Password=1QaZ#wE_070718042005;SSL Mode=Require;Trust Server Certificate=true;Pooling=true;Maximum Pool Size=10
GOOGLE_CLIENT_ID=1062322191120-lqbcjge0v3jg4igmr1kdq3jd1ffv3qge.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_API_KEY=AIzaSyA3vS3E8AzY_8zA79FyaVZYrXKRoxynmb4
FRONTEND_URL=https://mypal-eta.vercel.app
```

---

## After both services are live

1. Copy the C# service public URL (e.g. `https://mypal-csharp-xxxx.koyeb.app`)
2. In the **gateway** service env vars, set:
   `CSHARP_MAIN_API_URL=https://mypal-csharp-xxxx.koyeb.app`
3. Copy the gateway public URL (e.g. `https://mypal-gateway-xxxx.koyeb.app`)
4. Send it — I'll update Vercel VITE_API_GATEWAY in one command.
