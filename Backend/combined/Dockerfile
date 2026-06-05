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
FROM golang:1.24-alpine AS go-build
ENV GOTOOLCHAIN=auto CGO_ENABLED=0
WORKDIR /src

# Install protoc and the Go gRPC code generators so the support binary can be
# built with gRPC support even if generated files aren't committed.
RUN apk add --no-cache protobuf protobuf-dev
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

COPY proto/ /proto/
COPY go/ .

RUN go mod download
RUN go build -o /out/gateway ./cmd/gateway

# ── Stage 2: build & publish the C# API ──────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS dotnet-build
WORKDIR /src
# Copy proto alongside the C# source so Grpc.Tools can find it at build time.
COPY proto/ /proto/
COPY csharp/ .
# Grpc.Tools looks for the proto relative to the .proto Include path in the csproj.
# The csproj references Protos\mypal.proto, which we already copied there.
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
