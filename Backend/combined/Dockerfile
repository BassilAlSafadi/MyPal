# Combined image: Go API gateway + C# Main API in ONE container.
#
# Why: Hugging Face throttles Space-to-Space calls with HTTP 429. When the
# gateway and C# ran as separate Spaces, every authenticated request made a
# gateway→C# hop that HF rate-limited, breaking login. Running both in one
# container turns that hop into a localhost call that never leaves the box.
#
# Expected build context (assembled at deploy time):
#   /go/      -> Backend/Go
#   /csharp/  -> Backend/CSharp
#   /Dockerfile, /start.sh, /README.md

# ---- Stage 1: build the Go gateway (static binary) ----
FROM golang:1.24-alpine AS go-build
ENV GOTOOLCHAIN=auto CGO_ENABLED=0
WORKDIR /src
COPY go/ .
RUN go mod download
RUN go build -o /out/gateway ./cmd/gateway

# ---- Stage 2: build & publish the C# API ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS dotnet-build
WORKDIR /src
COPY csharp/ .
RUN dotnet publish "MyPal.API/MyPal.API.csproj" -c Release -o /out/csharp

# ---- Final: .NET runtime hosting both processes ----
FROM mcr.microsoft.com/dotnet/aspnet:9.0
# curl: start.sh health-probes the C# port. ca-certificates: TLS to Supabase.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dotnet-build /out/csharp ./csharp
COPY --from=go-build /out/gateway ./gateway
COPY start.sh ./start.sh
RUN chmod +x ./start.sh
# No NATS in this deployment — gateway runs proxy routes without the outbox workers.
ENV MESSAGING_ENABLED=false
EXPOSE 7860
CMD ["./start.sh"]
