# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

ARG CACHEBUST=1
RUN echo "bust=$CACHEBUST"
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: runner ────────────────────────────────────────────────────────────
# Use node:20-slim (Debian bookworm) — Puppeteer downloads its own Chromium
# which is tested to work in containerised environments.
FROM node:20-slim AS runner
WORKDIR /app

# Install only the system libs Puppeteer's bundled Chromium needs
# Do NOT install the 'chromium' package — we use Puppeteer's own binary instead
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd  --system --uid 1001 --gid nodejs boardos

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma       ./prisma

# Download Puppeteer's own Chromium — this is the tested binary for this
# version of puppeteer, guaranteed to work without crashpad issues
RUN npx puppeteer browsers install chrome

# Pre-generate Prisma client as root so engine binaries are in place
RUN npx prisma generate

# Fix ownership so non-root user can read everything including Puppeteer cache
RUN chown -R boardos:nodejs /app && \
    chown -R boardos:nodejs /root/.cache 2>/dev/null || true

USER boardos
EXPOSE 3001
ENV PORT=3001
ENV PUPPETEER_NO_SANDBOX=true
# Do NOT set PUPPETEER_EXECUTABLE_PATH — let Puppeteer find its own binary

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
