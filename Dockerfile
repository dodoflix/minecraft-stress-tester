# Build
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci
COPY tsconfig.base.json tsconfig.json ./
COPY packages/core ./packages/core
COPY packages/server ./packages/server
RUN npm run build

# Runtime
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist
# Reports and the Microsoft token cache live under /app; mount volumes to persist.
ENTRYPOINT ["node", "packages/core/dist/cli.js"]
