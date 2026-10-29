# npm workspaces: packages/core, packages/mcp, apps/web. Web build bundles @tourbo/* (ssr.noExternal);
# package sources ship too so the stdio MCP server and maintenance scripts run from the image.
FROM node:22-alpine AS development-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM node:22-alpine AS production-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

FROM node:22-alpine AS build-env
WORKDIR /app
COPY . .
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web/package.json apps/web/server.js apps/web/
COPY apps/web/scripts apps/web/scripts
COPY apps/web/server apps/web/server
COPY --from=build-env /app/apps/web/build apps/web/build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
