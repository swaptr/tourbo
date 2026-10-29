import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { mcpCatalog } from "../../server/mcp.server";
import type { Route } from "./+types/connect";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Connect your agent — Tourbo MCP" }];
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
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
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

export default function Connect({ loaderData }: Route.ComponentProps) {
  const { tourbo, qloo, remoteEnabled, mcpUrl } = loaderData;
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Use Tourbo from your own Claude</h1>
      <p className="mt-2 text-muted-foreground">
        This site's planner is Claude using the Tourbo tools. You can give the same tools to your own Claude: it then plans
        tours, checks offers and writes show notes inside your chats and workflows. Tourbo does no AI itself; your Claude does
        the thinking, Qloo supplies the taste data.
      </p>

      <ol className="mt-8 space-y-6">
        <li>
          <Card>
            <CardHeader>
              <CardTitle>Easiest: Claude Code in the Tourbo folder</CardTitle>
              <CardDescription>Three steps, nothing to configure. The folder's .mcp.json registers Tourbo for you.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Snippet title="1. Get the code and install" code={"git clone https://github.com/<you>/tourbo && cd tourbo\nnpm install"} />
              <Snippet title="2. Add your Qloo key to .env (never commit it)" code={"cp .env.example .env   # then set QLOO_API_KEY"} />
              <Snippet title="3. Open Claude Code there and ask" code={'claude\n> Plan a 4-show tour for Japanese Breakfast near Seattle that makes money'} />
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardHeader>
              <CardTitle>Any other folder, or Claude Desktop</CardTitle>
              <CardDescription>Point your client at the stdio server. The key stays in the Tourbo .env file, not in your config.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Snippet
                title="Claude Code (any folder)"
                code={`claude mcp add --transport stdio tourbo -- node --env-file-if-exists=/path/to/tourbo/.env /path/to/tourbo/packages/mcp/src/bin/stdio.ts`}
              />
              <Snippet title="Claude Desktop (claude_desktop_config.json)" code={stdioJson} />
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Hosted endpoint
                <Badge variant={remoteEnabled ? "default" : "secondary"}>{remoteEnabled ? "on" : "off on this server"}</Badge>
              </CardTitle>
              <CardDescription>No install. Uses this server's Qloo key, so it needs a token from whoever runs it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Snippet title="Claude Code" code={`claude mcp add --transport http --header "Authorization: Bearer <token>" tourbo ${mcpUrl}`} />
            </CardContent>
          </Card>
        </li>
      </ol>

      <details className="mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          All {tourbo.length + qloo.length} tools <span className="font-normal text-muted-foreground">· for builders</span>
        </summary>
        <div className="border-t px-4 pb-4">
      <section className="mt-2">
        <h2 className="font-heading text-xl font-semibold">Tourbo tools ({tourbo.length})</h2>
        <ToolList tools={tourbo} />
        <h2 className="mt-8 font-heading text-xl font-semibold">Qloo workflow tools ({qloo.length})</h2>
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
