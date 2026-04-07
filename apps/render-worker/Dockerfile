FROM node:20-slim

# Install Chrome and dependencies required by @remotion/renderer (renderMedia).
# node:20-slim is Debian-based, so apt-get is available.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
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
    ca-certificates \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Remotion / Puppeteer where to find Chrome.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy workspace manifests for layer-cached dependency installation.
COPY package.json tsconfig.json ./
COPY apps/render-worker/package.json ./apps/render-worker/
COPY packages/project-schema/package.json ./packages/project-schema/
COPY packages/remotion-comps/package.json ./packages/remotion-comps/

RUN npm install \
    --workspace=apps/render-worker \
    --workspace=packages/project-schema \
    --workspace=packages/remotion-comps

COPY packages/project-schema ./packages/project-schema
COPY packages/remotion-comps ./packages/remotion-comps
COPY apps/render-worker ./apps/render-worker

RUN npm run build --workspace=packages/project-schema
RUN npm run build --workspace=packages/remotion-comps
RUN npm run build --workspace=apps/render-worker

CMD ["node", "apps/render-worker/dist/index.js"]
