# Dockerfile for the MyPal Go Support Service (cmd/main.go).
# Exposes HTTP on PORT (default 5001) and gRPC on SUPPORT_GRPC_PORT (default 5011).
FROM golang:1.24-alpine AS builder
ENV GOTOOLCHAIN=auto CGO_ENABLED=0
WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o support ./cmd

FROM alpine:latest
RUN apk add --no-cache ca-certificates
WORKDIR /root/
COPY --from=builder /app/support .
EXPOSE 5001
EXPOSE 5011
CMD ["./support"]
