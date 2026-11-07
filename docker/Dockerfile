# ============================================================
# Multi-Stage Production Dockerfile for E-Commerce Platform
# Optimized for slim size, security, and minimal attack surface
# Compatible with both x86_64 and ARM64 (AWS Graviton & OCI Ampere)
# ============================================================

FROM node:22-alpine AS runner

# Install dumb-init to handle PID 1 signal forwarding and zombie processes
RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy application manifest and source code
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

# Create data directory for SQLite database & set permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-privileged node user for security
USER node

# Expose internal application port
EXPOSE 3000

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
