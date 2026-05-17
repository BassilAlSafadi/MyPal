# Dockerfile for go-support
FROM golang:1.24-alpine AS builder
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY . .
RUN go mod tidy
RUN go mod download
RUN go build -o support ./cmd/main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/support .
CMD ["./support"]
