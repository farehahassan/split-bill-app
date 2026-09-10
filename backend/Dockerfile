# ---------------------------------------------------------------------------
# Multi-stage Dockerfile — Hisab Backend
# ---------------------------------------------------------------------------
# Build stage:  install ALL dependencies, compile TypeScript, generate Prisma
# Runtime stage: production dependencies + compiled output only
# ---------------------------------------------------------------------------

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Install only the files needed for a deterministic install
COPY backend/package.json backend/package-lock.json ./

# Install ALL dependencies (dev + prod) so TypeScript & Prisma CLI are available
RUN npm ci

# Copy Prisma schema first (layer cache — schema changes rarely)
COPY backend/prisma ./prisma

# Generate the Prisma Client (reads schema + node_modules/@prisma/client)
RUN npx prisma generate

# Copy source code
COPY backend/tsconfig.json ./
COPY backend/src ./src

# Compile TypeScript
RUN npm run build

# Remove devDependencies from the install tree so the runtime image is smaller.
# This mutates node_modules in-place; the result is copied to the runtime stage.
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Run as non-root for security
RUN groupadd --gid 1001 appgroup && \
    useradd  --uid 1001 --gid appgroup --shell /bin/sh --create-home appuser

WORKDIR /app

# Copy the entire /app from build (node_modules, dist, prisma, package.json)
COPY --from=build --chown=appuser:appgroup /app .

# Prisma needs the query engine binary at runtime — it is already inside
# node_modules/.prisma/client from the generate step above.

# The app reads PORT from the environment; default to 3000.
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER appuser

# Health check hitting the liveness endpoint (always 200 if process is alive)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
