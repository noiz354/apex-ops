# Aligner — submission Docker image (multi-stage).
# Repro: docker build -t aligner:submission . && docker compose up
# Demo: BILLING_DEMO_MODE=true (offline billing fixture, zero secrets).

# ---- build: install (lockfile) + Next.js production build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Skip Next's telemetry prompt inside CI/Docker (non-interactive).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run: source + build output + entrypoint (migrate/seed, then serve) ----
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PGDATA_DIR=/data/pg \
    BILLING_DEMO_MODE=true
# PGlite persists its data dir under PGDATA_DIR; keep it on a volume.
RUN mkdir -p /data/pg && chown -R node:node /data /app
COPY --from=build --chown=node:node /app ./
COPY entrypoint.sh /entrypoint.sh
USER node
VOLUME ["/data/pg"]
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
