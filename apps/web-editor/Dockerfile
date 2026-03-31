FROM node:20-alpine

WORKDIR /app

# Copy workspace manifests for layer-cached dependency installation.
# web-editor has file: references to all four shared packages.
COPY package.json tsconfig.json ./
COPY apps/web-editor/package.json ./apps/web-editor/
COPY packages/project-schema/package.json ./packages/project-schema/
COPY packages/ui/package.json ./packages/ui/
COPY packages/editor-core/package.json ./packages/editor-core/
COPY packages/remotion-comps/package.json ./packages/remotion-comps/

RUN npm install \
  --workspace=apps/web-editor \
  --workspace=packages/project-schema \
  --workspace=packages/ui \
  --workspace=packages/editor-core \
  --workspace=packages/remotion-comps

COPY packages ./packages
COPY apps/web-editor ./apps/web-editor

EXPOSE 5173

# Run Vite dev server bound to all interfaces so the host browser can reach it.
WORKDIR /app/apps/web-editor
CMD ["npx", "vite", "--host", "0.0.0.0"]
