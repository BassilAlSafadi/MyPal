# Local embedding service — satisfies the PRODBERT_URL /embed contract that
# MyPal.Listings/Search/SemanticSearch.cs and the ai service expect.
#
# node:slim (glibc), not alpine: onnxruntime-node's prebuilt binaries (used by
# @xenova/transformers) are built against glibc and do not load on musl.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
ENV PRODBERT_PORT=8001
EXPOSE 8001
CMD ["node", "server.mjs"]
