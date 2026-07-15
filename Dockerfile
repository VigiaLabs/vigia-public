# ── Stage 1: Build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

# Copy source
COPY tsconfig.json ./
COPY server/ ./server/
COPY lib/ ./lib/
COPY data/ ./data/
COPY types/ ./types/

# Compile TypeScript and resolve path aliases (@/ → ../)
RUN npx tsc -p server/tsconfig.json && npx tsc-alias -p server/tsconfig.json

# ── Stage 2: Runtime dependencies ────────────────────────────────────
FROM node:20-alpine AS runtime-deps
WORKDIR /app
COPY server/package.runtime.json ./package.json
RUN npm install --omit=dev --legacy-peer-deps
RUN mkdir /deps-a /deps-b /deps-c /deps-d /deps-rest \
  && mv node_modules/@langchain /deps-a/ \
  && mv node_modules/js-tiktoken node_modules/better-sqlite3 /deps-b/ \
  && mv node_modules/@ai-sdk node_modules/@aws-sdk node_modules/@smithy /deps-c/ \
  && mv node_modules/ai node_modules/zod node_modules/langsmith node_modules/@opentelemetry /deps-d/ \
  && mv node_modules/* node_modules/.[!.]* /deps-rest/ 2>/dev/null || true

# ── Stage 3: Runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=runtime-deps /deps-a/ ./node_modules/
COPY --from=runtime-deps /deps-b/ ./node_modules/
COPY --from=runtime-deps /deps-c/ ./node_modules/
COPY --from=runtime-deps /deps-d/ ./node_modules/
COPY --from=runtime-deps /deps-rest/ ./node_modules/

# Compiled output + data
# tsc -p server/tsconfig.json outputs to dist/server/ (rootDir is repo root)
COPY --from=builder /app/dist ./dist
COPY data/ ./data/

EXPOSE 8080

# Tini as PID 1 for proper signal handling in Fargate
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/server/index.js"]
