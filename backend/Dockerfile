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
FROM node:20-slim AS runner
WORKDIR /app

# Install system libs required by Puppeteer's bundled Chromium
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
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

# Set Puppeteer cache dir to a path owned by boardos
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache
ENV PUPPETEER_NO_SANDBOX=true

# Install Puppeteer's Chrome into the app directory (not /root/.cache)
RUN npx puppeteer browsers install chrome

# Pre-generate Prisma client
RUN npx prisma generate

# Fix ownership — includes the Puppeteer cache
RUN chown -R boardos:nodejs /app

USER boardos
EXPOSE 3001
ENV PORT=3001

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
