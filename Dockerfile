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

# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps

# Compiled output + data
# tsc -p server/tsconfig.json outputs to dist/server/ (rootDir is repo root)
COPY --from=builder /app/dist ./dist
COPY data/ ./data/

EXPOSE 8080

# Tini as PID 1 for proper signal handling in Fargate
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/server/index.js"]
