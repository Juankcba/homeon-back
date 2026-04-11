# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json nest-cli.json ./
COPY src/ src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ---- Production stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Security: non-root user
RUN addgroup -S homeon && adduser -S homeon -G homeon

# Copy built app + production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

USER homeon

EXPOSE 3001

CMD ["node", "dist/main"]
