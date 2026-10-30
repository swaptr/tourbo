import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { BrandMark, BRANDS } from "~/components/partner-logos";
import { mcpCatalog } from "../../server/mcp.server";
import type { Route } from "./+types/connect";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Use Tourbo from your AI assistant (MCP)" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const catalog = mcpCatalog();
  const origin = catalog.publicUrl ?? new URL(request.url).origin;
  return { ...catalog, mcpUrl: `${origin.replace(/\/$/, "")}/mcp` };
}

// Placeholders only: never publish a real Qloo key or MCP token in a config.
const stdioJson = JSON.stringify(
  {
    mcpServers: {
      tourbo: {
        command: "node",
        args: ["--env-file-if-exists=/path/to/tourbo/.env", "/path/to/tourbo/packages/mcp/src/bin/stdio.ts"],
      },
    },
  },
  null,
  2,
);

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{title}</p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
        <button
          type="button"
          aria-label={copied ? "Copied" : `Copy: ${title}`}
          className="absolute top-2 right-2 rounded-md bg-background p-1.5 text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
          onClick={() =>
            navigator.clipboard?.writeText(code.replace(/^> /gm, "")).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function ToolList({ tools }: { tools: { name: string; title: string; description: string }[] }) {
  return (
    <ul className="divide-y">
      {tools.map((t) => (
        <li key={t.name} className="py-2.5">
          <code className="text-sm font-medium">{t.name}</code>
          <span className="ml-2 text-sm text-muted-foreground">{t.title}</span>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
        </li>
      ))}
    </ul>
  );
}

const STDIO = "node --env-file-if-exists=/path/to/tourbo/.env /path/to/tourbo/packages/mcp/src/bin/stdio.ts";
const vscodeJson = JSON.stringify(
  { servers: { tourbo: { type: "stdio", command: "node", args: ["--env-file-if-exists=/path/to/tourbo/.env", "/path/to/tourbo/packages/mcp/src/bin/stdio.ts"] } } },
  null,
  2,
);

type Client = { id: string; label: string; brand?: keyof typeof BRANDS; status: string };
const CLIENTS: Client[] = [
  { id: "claude", label: "Claude", brand: "claude", status: "works locally" },
  { id: "chatgpt", label: "ChatGPT", brand: "chatgpt", status: "needs the hosted endpoint" },
  { id: "gemini", label: "Gemini", brand: "gemini", status: "works locally" },
  { id: "cursor", label: "Cursor / VS Code", status: "works locally" },
  { id: "other", label: "Others", status: "any MCP client" },
];

export default function Connect({ loaderData }: Route.ComponentProps) {
  const { tourbo, qloo, remoteEnabled, mcpUrl } = loaderData;
  const [tab, setTab] = useState("claude");
  // Links like /connect#gemini open that client's tab.
  useEffect(() => {
    const pick = () => {
      const id = window.location.hash.slice(1);
      if (CLIENTS.some((c) => c.id === id)) setTab(id);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);
  const remoteBadge = <Badge variant={remoteEnabled ? "default" : "secondary"}>{remoteEnabled ? "on" : "off on this server"}</Badge>;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl tracking-tight">Use Tourbo from your AI assistant</h1>
      <p className="mt-2 text-muted-foreground">
        Give your own AI assistant Tourbo's tour tools over MCP, the open standard most assistants speak. It can then plan tours,
        check offers and write show notes right in your chats. Tourbo's tools do no AI themselves: your assistant does the
        thinking, Tourbo brings the fan data and the tour math.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Any MCP client</CardTitle>
          <CardDescription>Run the server on your machine (stdio), or point your client at the hosted URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Snippet title="1. Get the code and install" code={"git clone https://github.com/<you>/tourbo && cd tourbo\nnpm install"} />
          <Snippet title="2. Add your Qloo API key to .env (never commit it)" code={"cp .env.example .env   # then set QLOO_API_KEY"} />
          <Snippet title="3. The command your client runs (stdio)" code={STDIO} />
          <div className="grid gap-1.5">
            <p className="flex items-center gap-2 text-sm font-medium">Or the hosted URL (Streamable HTTP) {remoteBadge}</p>
            <Snippet title="Needs a token from whoever runs this server: Authorization: Bearer <token>" code={mcpUrl} />
          </div>
        </CardContent>
      </Card>

      <h2 className="mt-12 text-xl">Step by step for your assistant</h2>
      <div role="tablist" aria-label="AI assistants" className="mt-4 flex flex-wrap gap-2">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            id={`tab-${c.id}`}
            role="tab"
            type="button"
            aria-selected={tab === c.id}
            aria-controls={`panel-${c.id}`}
            onClick={() => {
              setTab(c.id);
              history.replaceState(null, "", `#${c.id}`);
            }}
            className={cn(
              "flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ring-1 transition-colors",
              tab === c.id ? "bg-card ring-2 ring-primary" : "ring-border hover:bg-card",
            )}
          >
            {c.brand && BRANDS[c.brand].onDark ? <BrandMark brand={BRANDS[c.brand]} className="h-4" /> : c.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Logos belong to their owners and only show which apps can connect; no endorsement implied.</p>

      {CLIENTS.map((c) => (
        <section key={c.id} id={c.id} role="tabpanel" aria-labelledby={`tab-${c.id}`} hidden={tab !== c.id} className="mt-4 scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.label} <Badge variant="secondary">{c.status}</Badge>
              </CardTitle>
              {c.id === "claude" && (
                <CardDescription>Claude Code, Claude Desktop, or a custom connector on claude.ai (custom connectors take a remote URL).</CardDescription>
              )}
              {c.id === "chatgpt" && (
                <CardDescription>
                  ChatGPT only connects to a server on a public HTTPS address (or through OpenAI's Secure MCP Tunnel), with no sign-in or
                  OAuth sign-in. It doesn't take API keys or bearer tokens, so it works once the hosted endpoint is deployed with OAuth
                  sign-in. Full tool use needs a Business, Enterprise or Edu workspace.
                </CardDescription>
              )}
              {c.id === "gemini" && (
                <CardDescription>
                  Gemini CLI runs the Tourbo server on your machine. Google moved free-tier and Google One users to Antigravity CLI in
                  June 2026. The Gemini app's custom apps (US, personal accounts) need the public endpoint, like ChatGPT.
                </CardDescription>
              )}
              {c.id === "cursor" && <CardDescription>Both editors run stdio servers from a JSON file in your project or home folder.</CardDescription>}
              {c.id === "other" && (
                <CardDescription>Any client that speaks MCP works: give it the stdio command above, or the hosted URL with a bearer token.</CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {c.id === "claude" && (
                <>
                  <Snippet title="Claude Code in the Tourbo folder: nothing to set up (.mcp.json registers Tourbo)" code={'claude\n> Plan a 4-show tour for Japanese Breakfast near Seattle that makes money'} />
                  <Snippet title="Claude Code in any folder" code={`claude mcp add --transport stdio tourbo -- ${STDIO}`} />
                  <Snippet title="Claude Desktop (claude_desktop_config.json)" code={stdioJson} />
                  <Snippet title="Hosted endpoint in Claude Code" code={`claude mcp add --transport http --header "Authorization: Bearer <token>" tourbo ${mcpUrl}`} />
                </>
              )}
              {c.id === "chatgpt" && (
                <div className="grid gap-2 text-sm">
                  <p>When the endpoint is public:</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>Open ChatGPT, go to Plugins and press +.</li>
                    <li>Choose Add custom MCP server, name it Tourbo and paste the endpoint below.</li>
                    <li>Sign in when asked, then ask for a tour.</li>
                  </ol>
                  <Snippet title="Endpoint" code={mcpUrl} />
                </div>
              )}
              {c.id === "gemini" && <Snippet title="Gemini CLI: add to ~/.gemini/settings.json" code={stdioJson} />}
              {c.id === "cursor" && (
                <>
                  <Snippet title="Cursor: .cursor/mcp.json (project) or ~/.cursor/mcp.json" code={stdioJson} />
                  <Snippet title="VS Code: .vscode/mcp.json" code={vscodeJson} />
                </>
              )}
              {c.id === "other" && <Snippet title="Most clients take this shape (mcpServers)" code={stdioJson} />}
            </CardContent>
          </Card>
        </section>
      ))}

      <details className="mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          All {tourbo.length + qloo.length} tools <span className="font-normal text-muted-foreground">· for builders</span>
        </summary>
        <div className="border-t px-4 pb-4">
      <section className="mt-2">
        <h2 className="font-heading text-xl">Tourbo tools ({tourbo.length})</h2>
        <ToolList tools={tourbo} />
        <h2 className="mt-8 font-heading text-xl">Qloo workflow tools ({qloo.length})</h2>
        <p className="text-sm text-muted-foreground">
          A TypeScript port of Qloo's hackathon harness workflows, with name resolution and the same result envelope.
        </p>
        <ToolList tools={qloo} />
      </section>
        </div>
      </details>
    </main>
  );
}
