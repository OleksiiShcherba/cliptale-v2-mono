FROM node:20-alpine

WORKDIR /app

# Copy workspace manifests for layer-cached dependency installation.
COPY package.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/project-schema/package.json ./packages/project-schema/
COPY packages/api-contracts/package.json ./packages/api-contracts/

RUN npm install \
  --workspace=apps/api \
  --workspace=packages/project-schema \
  --workspace=packages/api-contracts

COPY packages/project-schema ./packages/project-schema
COPY packages/api-contracts ./packages/api-contracts
COPY apps/api ./apps/api

RUN npm run build --workspace=packages/project-schema
RUN npm run build --workspace=packages/api-contracts
RUN npm run build --workspace=apps/api

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
