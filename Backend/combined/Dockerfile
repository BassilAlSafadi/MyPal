# Combined image: Go API gateway + C# Main API in ONE container.
#
# Why combined: Hugging Face throttles Space-to-Space calls (HTTP 429). Running
# both in one container turns gateway→C# into a localhost call that never leaves
# the box — and now the gateway calls C# via gRPC on localhost:5010.
#
# Expected build context (assembled at deploy time):
#   /go/      -> Backend/Go
#   /csharp/  -> Backend/CSharp
#   /proto/   -> Backend/proto
#   /Dockerfile, /start.sh, /README.md

# ── Stage 1: build the Go gateway (static binary) ────────────────────────────
# No protoc needed: the gateway uses structpb (a well-known type) directly
# instead of generated proto stubs, so zero code-generation steps required.
FROM golang:1.24-alpine AS go-build
ENV GOTOOLCHAIN=auto CGO_ENABLED=0
WORKDIR /src
COPY go/ .
RUN go mod download
RUN go build -o /out/gateway ./cmd/gateway

# ── Stage 2: build & publish the C# API ──────────────────────────────────────
# Grpc.Tools reads Protos\mypal.proto relative to the .csproj — that file is
# already inside csharp/MyPal.API/Protos/ so no extra COPY needed.
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS dotnet-build
WORKDIR /src
COPY csharp/ .
RUN dotnet publish "MyPal.API/MyPal.API.csproj" -c Release -o /out/csharp

# ── Final: .NET runtime hosting both processes ────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dotnet-build /out/csharp ./csharp
COPY --from=go-build /out/gateway   ./gateway
COPY start.sh ./start.sh
RUN chmod +x ./start.sh
ENV MESSAGING_ENABLED=false
EXPOSE 7860
CMD ["./start.sh"]
