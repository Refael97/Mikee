# Mikee render worker: Node 22, Chromium and FFmpeg for HyperFrames.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ffmpeg fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    DO_NOT_TRACK=1 \
    HYPERFRAMES_NO_TELEMETRY=1 \
    NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
RUN useradd --create-home render && chown -R render /app
USER render
EXPOSE 8080
CMD ["node", "server.mjs"]
