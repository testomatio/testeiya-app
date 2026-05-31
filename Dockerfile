# syntax=docker/dockerfile:1.7

# Agent + TestClaw production image for Cloudflare Sandbox / Containers.
#
# Two runtimes in one container:
# - Bun (>=1.3.5) — required by TestClaw WS server (@oh-my-pi/pi-coding-agent
#   uses Bun.JSONL.parseChunk to parse MCP stdio traffic; not polyfilled).
# - Node.js (>=22)  — required to spawn child MCP processes
#   (@testomatio/mcp uses `#!/usr/bin/env node`) and as the Next.js runtime.
#
# If you change Bun or Node versions, also update package.json `engines`.

ARG BUN_VERSION=1.3.12
ARG NODE_MAJOR=22

FROM oven/bun:${BUN_VERSION}-debian AS base
ARG NODE_MAJOR

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version \
 && bun --version

WORKDIR /app

# ---------- Dependencies layer (cached until lockfiles change) ----------
FROM base AS deps

COPY package.json package-lock.json ./
COPY testclaw/package.json testclaw/package-lock.json ./testclaw/

RUN npm ci --ignore-scripts \
 && (cd testclaw && npm ci --ignore-scripts)

# ---------- Build layer ----------
FROM deps AS build

COPY . .

# Build Next.js standalone output for smaller runtime
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
 && (cd testclaw && npm run build || true)

# ---------- Runtime layer ----------
FROM base AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    TESTCLAW_PORT=3210

WORKDIR /app

# Copy installed deps and built assets
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/testclaw/node_modules ./testclaw/node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/testclaw/package.json ./testclaw/
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/app ./app
COPY --from=build /app/lib ./lib
COPY --from=build /app/components ./components
COPY --from=build /app/hooks ./hooks
COPY --from=build /app/testclaw ./testclaw
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/tsconfig.json ./

# Expose Next.js HTTP and TestClaw WebSocket ports
EXPOSE 3000 3210

# Start both services under a single supervisor (concurrently)
CMD ["npm", "run", "start:prod"]
