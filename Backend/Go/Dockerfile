# Dockerfile for go-support
FROM golang:1.24-alpine AS builder
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY . .
RUN go mod tidy
RUN go mod download
RUN go build -o support ./cmd/main.go

FROM alpine:latest
# ca-certificates is required for TLS to Supabase (Postgres pooler).
RUN apk add --no-cache ca-certificates
WORKDIR /root/
COPY --from=builder /app/support .
CMD ["./support"]
