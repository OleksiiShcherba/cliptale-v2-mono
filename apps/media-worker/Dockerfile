FROM node:20-alpine

# Install FFmpeg and FFprobe — required by ingest.job.ts for metadata extraction,
# thumbnail generation, and waveform peak computation.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy workspace manifests for dependency installation.
COPY package.json tsconfig.json ./
COPY apps/media-worker/package.json ./apps/media-worker/
COPY packages/project-schema/package.json ./packages/project-schema/

RUN npm install --workspace=apps/media-worker --workspace=packages/project-schema

COPY packages/project-schema ./packages/project-schema
COPY apps/media-worker ./apps/media-worker

RUN npm run build --workspace=packages/project-schema
RUN npm run build --workspace=apps/media-worker

CMD ["node", "apps/media-worker/dist/index.js"]
