# @tourbo/mcp

Tour-planning tools for small acts over [MCP](https://modelcontextprotocol.io): score cities by fan data, find rooms and openers, check show economics, route the run, assess offers, write per-city show notes. Includes the Qloo hackathon-harness workflows as `qloo_*` tools. No AI inside: your assistant does the thinking.

You need your own **Qloo API key** (`QLOO_API_KEY`). Node 22 or newer. Never put a real key or token in a config you share or commit; the snippets below use `<your-key>`.

## Stdio (Claude Desktop, Claude Code, Cursor, any stdio client)

```sh
QLOO_API_KEY=<your-key> npx -y @tourbo/mcp
```

Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`) and most clients:

```json
{
  "mcpServers": {
    "tourbo": {
      "command": "npx",
      "args": ["-y", "@tourbo/mcp"],
      "env": { "QLOO_API_KEY": "<your-key>" }
    }
  }
}
```

Claude Code:

```sh
claude mcp add --env QLOO_API_KEY=<your-key> --transport stdio tourbo -- npx -y @tourbo/mcp
```

VS Code (`.vscode/mcp.json`):

```json
{
  "inputs": [{ "type": "promptString", "id": "qloo-key", "description": "Qloo API key", "password": true }],
  "servers": {
    "tourbo": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@tourbo/mcp"],
      "env": { "QLOO_API_KEY": "${input:qloo-key}" }
    }
  }
}
```

## Your own HTTP endpoint (Streamable HTTP)

```sh
QLOO_API_KEY=<your-key> MCP_TOKENS=<your-token> npx -y @tourbo/mcp --http --port 8787
```

Endpoint `http://127.0.0.1:8787/mcp` (clients send `Authorization: Bearer <your-token>`), health check `/healthz`. It refuses to start without `MCP_TOKENS` unless you pass `--no-auth` (private networks only). Bind another address with `--host 0.0.0.0`.

Claude Code against it:

```sh
claude mcp add --transport http tourbo http://127.0.0.1:8787/mcp --header "Authorization: Bearer <your-token>"
```

## Docker

```sh
docker run --rm -p 8787:8787 -e QLOO_API_KEY=<your-key> -e MCP_TOKENS=<your-token> ghcr.io/<owner>/tourbo-mcp
```

From the Tourbo repo: `docker compose --profile mcp up -d --build mcp` (reads `QLOO_API_KEY` and `MCP_TOKENS` from `.env`).

## Options

| Flag / env | |
|---|---|
| `--http`, `--port <n>`, `--host <addr>` | HTTP mode (default port `PORT` or 8787, host `HOST` or 127.0.0.1) |
| `--no-auth` | HTTP without tokens (logs a warning) |
| `--version`, `--help` | |
| `QLOO_API_KEY` | your key; without it tools still list and each call says to set it |
| `MCP_TOKENS` | HTTP bearer tokens, comma-separated |
| `MCP_RATE_LIMIT` | HTTP tool calls per token and per IP, e.g. `200/10m` (default), `off` |
| `MCP_ALLOWED_ORIGINS` | browser origins allowed to call (default none; CORS is off) |
| `MCP_TRUST_PROXY=1` | client IP from `X-Forwarded-For` |
| `DATABASE_URL` | Postgres for the `tourbo_project_*` tools; without it they say projects need it |
| `TOURBO_TOOLSETS` | `tourbo`, `qloo` or both (default) |

## Hosted

The Tourbo web app serves the same server at `https://<host>/mcp` with its own key, behind bearer tokens and a per-token and per-IP rate limit (200 tool calls per 10 minutes). The public deployment takes the shared demo token `tourbo-demo`:

```sh
claude mcp add --transport http tourbo https://tourbo-30ec.onrender.com/mcp --header "Authorization: Bearer tourbo-demo"
```

On your own deployment, `MCP_PUBLIC_TOKEN` sets a token that `/connect` shows to everyone; `MCP_TOKENS` holds private ones. See `/connect` on the deployment.

## Build from source

```sh
npm install && npm run mcp:build   # → packages/mcp/dist/bin/tourbo-mcp.js (one bundled ESM file)
```

MIT. The `qloo_*` workflows are a TypeScript port of `@qloo/qloo-harness` (MIT).
