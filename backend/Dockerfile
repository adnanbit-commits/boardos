# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Skip Puppeteer's Chromium download — not needed at build time, only runtime
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json ./
RUN npm install --legacy-peer-deps

ARG CACHEBUST=1
RUN echo "bust=$CACHEBUST"
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: runner ────────────────────────────────────────────────────────────
# Puppeteer requires Chromium — use the full Debian base for production.
FROM node:20-slim AS runner
WORKDIR /app

# Install Chromium and its deps for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_NO_SANDBOX=true

# Non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd  --system --uid 1001 --gid nodejs boardos

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma       ./prisma

# Pre-generate Prisma client as root so engine binaries are in place
RUN npx prisma generate

# Fix ownership so non-root user can read everything
RUN chown -R boardos:nodejs /app

USER boardos
EXPOSE 3001
ENV PORT=3001

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
