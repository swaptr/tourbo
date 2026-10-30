# Self-hosted Tourbo MCP server over Streamable HTTP (one bundled file, no database, no fan-data cache).
# Build from the repo root:  docker build -f packages/mcp/Dockerfile -t tourbo-mcp .
# Run:  docker run --rm -p 8787:8787 -e QLOO_API_KEY=<your-key> -e MCP_TOKENS=<your-token> tourbo-mcp
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
# Only the MCP workspace (and @tourbo/core); no install scripts needed to bundle.
RUN npm ci -w @tourbo/mcp --ignore-scripts
COPY packages/core packages/core
COPY packages/mcp packages/mcp
RUN npm run build -w @tourbo/mcp

FROM node:22-alpine
LABEL org.opencontainers.image.title="tourbo-mcp" \
      org.opencontainers.image.description="Tourbo MCP server (Streamable HTTP, bearer tokens)" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --from=build /app/packages/mcp/dist/bin/tourbo-mcp.js ./tourbo-mcp.js
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
ENTRYPOINT ["node", "/app/tourbo-mcp.js", "--http"]
