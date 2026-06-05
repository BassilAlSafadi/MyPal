# Dockerfile for the MyPal Node.js LLM Orchestrator.
# Build context must include both Backend/Node/ and Backend/proto/.
# Deploy script should assemble: /node/ -> Backend/Node, /proto/ -> Backend/proto
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Copy the shared proto file so @grpc/proto-loader can find it at runtime.
# The grpc/server.js loader searches /proto/mypal.proto first.
COPY proto/ /proto/
EXPOSE 5003
EXPOSE 5013
CMD ["npm", "start"]
