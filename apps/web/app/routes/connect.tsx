import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { BRANDS } from "~/components/partner-logos";
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
const KEY = "<your-key>";
const TOKEN = "<your-token>";
const json = (v: unknown) => JSON.stringify(v, null, 2);
const NPX = { command: "npx", args: ["-y", "@tourbo/mcp"], env: { QLOO_API_KEY: KEY } };
const own = {
  run: `QLOO_API_KEY=${KEY} npx -y @tourbo/mcp`,
  http: `QLOO_API_KEY=${KEY} MCP_TOKENS=${TOKEN} npx -y @tourbo/mcp --http --port 8787`,
  docker: `docker run --rm -p 8787:8787 -e QLOO_API_KEY=${KEY} -e MCP_TOKENS=${TOKEN} ghcr.io/<owner>/tourbo-mcp`,
  claudeCode: `claude mcp add --env QLOO_API_KEY=${KEY} --transport stdio tourbo -- npx -y @tourbo/mcp`,
  mcpServers: json({ mcpServers: { tourbo: NPX } }),
  vscode: json({
    inputs: [{ type: "promptString", id: "qloo-key", description: "Qloo API key", password: true }],
    servers: { tourbo: { type: "stdio", ...NPX, env: { QLOO_API_KEY: "${input:qloo-key}" } } },
  }),
};
const ours = (url: string) => ({
  claudeCode: `claude mcp add --transport http tourbo ${url} --header "Authorization: Bearer ${TOKEN}"`,
  cursor: json({ mcpServers: { tourbo: { url, headers: { Authorization: `Bearer ${TOKEN}` } } } }),
  vscode: json({ servers: { tourbo: { type: "http", url, headers: { Authorization: `Bearer ${TOKEN}` } } } }),
  gemini: json({ mcpServers: { tourbo: { httpUrl: url, headers: { Authorization: `Bearer ${TOKEN}` } } } }),
});

function Snippet({ title, code, primary }: { title: string; code: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  // Code keeps its shape (no wrapping): the block scrolls sideways inside itself and is focusable
  // so keyboard users can scroll it. When it overflows, a soft right edge and "Scroll →" say so,
  // until the reader reaches the end.
  const pre = useRef<HTMLPreElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = pre.current;
    if (!el) return;
    const check = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => (ro.disconnect(), el.removeEventListener("scroll", check));
  }, [code]);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
          {title}
          {more && <span className="ml-2 text-xs font-normal whitespace-nowrap text-muted-foreground">Scroll →</span>}
        </p>
        <Button
          type="button"
          variant={primary ? "default" : "outline"}
          data-primary={primary || undefined}
          aria-label={copied ? "Copied" : `Copy: ${title}`}
          className="shrink-0 pointer-coarse:h-11"
          onClick={() =>
            navigator.clipboard?.writeText(code.replace(/^> /gm, "")).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="code-scroll" data-more={more || undefined}>
        <pre
          ref={pre}
          tabIndex={0}
          role="region"
          aria-label={`${title}${more ? " (scrolls sideways)" : ""}`}
          className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed whitespace-pre outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <code className="font-mono">{code}</code>
        </pre>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? `${title} copied` : ""}
      </span>
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

type Client = { id: string; label: string; brand?: keyof typeof BRANDS };
const CLIENTS: Client[] = [
  { id: "claude", label: "Claude", brand: "claude" },
  { id: "chatgpt", label: "ChatGPT", brand: "chatgpt" },
  { id: "gemini", label: "Gemini", brand: "gemini" },
  { id: "cursor", label: "Cursor / VS Code" },
  { id: "other", label: "Others" },
];
const MODES = [
  { id: "ours", label: "Use ours" },
  { id: "own", label: "Run your own" },
] as const;
type Mode = (typeof MODES)[number]["id"];

// The page is three steps: pick your assistant, pick where Tourbo runs, copy one block.
// Both pickers are Base UI tabs (arrows, Home/End); the hash (#gemini, #own) deep-links either.
export default function Connect({ loaderData }: Route.ComponentProps) {
  const { tourbo, qloo, remoteEnabled, mcpUrl } = loaderData;
  const [mode, setMode] = useState<Mode>(remoteEnabled ? "ours" : "own");
  const [tab, setTab] = useState("claude");
  useEffect(() => {
    const pick = () => {
      const id = window.location.hash.slice(1);
      if (MODES.some((m) => m.id === id)) setMode(id as Mode);
      if (CLIENTS.some((c) => c.id === id)) setTab(id);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);
  const go = (id: string) => history.replaceState(null, "", `#${id}`);
  const hosted = ours(mcpUrl);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-4xl text-balance sm:text-5xl">Use Tourbo from your AI assistant</h1>
      <p className="mt-3 max-w-prose text-muted-foreground">
        Give your AI assistant Tourbo's tour tools over MCP, so it can plan tours, check offers and write show notes in your chats.
        Tourbo brings the fan data (from Qloo) and the tour math; your assistant does the thinking (this site's own is Claude).
      </p>

      <div className="mt-10 grid gap-3">
          <Step n={1} title="Pick your assistant" />
          <Tabs
            className="min-w-0"
            value={tab}
            onValueChange={(v) => {
              setTab(String(v));
              go(String(v));
            }}
          >
            <TabsList aria-label="AI assistants" className="h-auto w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto [scrollbar-width:none] group-data-horizontal/tabs:h-auto sm:flex-wrap">
              {CLIENTS.map((c) => {
                return (
                  <TabsTrigger key={c.id} value={c.id} id={`tab-${c.id}`} aria-label={c.label} className="h-8 flex-none px-3 max-sm:px-2">
                    {c.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="mt-7 grid gap-3">
              <Step n={2} title={remoteEnabled ? "Pick where Tourbo runs" : "Run Tourbo yourself"} />
              {remoteEnabled ? (
                <Tabs
                  value={mode}
                  onValueChange={(v) => {
                    setMode(v as Mode);
                    go(String(v));
                  }}
                >
                  <TabsList aria-label="Where Tourbo runs" size="lg">
                    {MODES.map((m) => (
                      <TabsTrigger key={m.id} value={m.id} id={`tab-${m.id}`} className="px-3">
                        {m.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="ours" className="max-w-prose rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    Nothing to install: your assistant talks to this Tourbo. You need a token: ask whoever runs this Tourbo for one. Each
                    token gets 60 tool calls every 10 minutes.
                  </TabsContent>
                  <TabsContent value="own" className="grid gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <p className="max-w-prose text-muted-foreground">{OWN_NOTE}</p>
                    <Snippet title="Check it starts on your machine (Ctrl+C to stop)" code={own.run} />
                  </TabsContent>
                </Tabs>
              ) : (
                // The hosted address is off on this server: no dead option, one plain line instead.
                <>
                  <p className="max-w-prose text-muted-foreground">
                    {OWN_NOTE} This Tourbo doesn't offer a hosted address, so your assistant runs its own copy.
                  </p>
                  <Snippet title="Check it starts on your machine (Ctrl+C to stop)" code={own.run} />
                </>
              )}
            </div>

            <div className="mt-7 grid gap-3">
              <Step n={3} title="Copy this into your assistant" />
              {CLIENTS.map((c) => (
                <TabsContent key={c.id} value={c.id} className="grid grid-cols-[minmax(0,1fr)] gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <ClientSetup client={c.id} mode={mode} hosted={hosted} mcpUrl={mcpUrl} />
                </TabsContent>
              ))}
            </div>

            <div className="mt-7 grid gap-3">
              <Step n={4} title="Check it worked" />
              <p className="max-w-prose text-muted-foreground">
                Restart your assistant, then ask it: <q className="font-medium text-foreground">List Tourbo's tools.</q> You should see{" "}
                {tourbo.length + qloo.length} tools, {tourbo.length} of them starting with <span className="font-mono text-sm text-foreground">tourbo_</span>, such as{" "}
                <span className="font-mono text-sm text-foreground">tourbo_plan_tour</span>. Nothing listed? Check the address or command
                you pasted, and that your key or token is filled in.
              </p>
            </div>
          </Tabs>
      </div>

      <details className="group mt-12 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
          All {tourbo.length + qloo.length} tools <span className="font-normal text-muted-foreground">· for builders</span>
        </summary>
        <div className="border-t px-4 pb-4">
          <h2 className="mt-4 text-xl">Tourbo tools ({tourbo.length})</h2>
          <ToolList tools={tourbo} />
          <h2 className="mt-8 text-xl">Qloo workflow tools ({qloo.length})</h2>
          <p className="text-sm text-muted-foreground">A TypeScript port of Qloo's hackathon harness workflows, with name resolution and the same result envelope.</p>
          <ToolList tools={qloo} />
        </div>
      </details>
    </main>
  );
}

const OWN_NOTE =
  "Run the same server on your machine or your own host with your own Qloo API key (Node 22 or newer). Keep keys and tokens out of anything you share or commit.";

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 text-2xl">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-foreground/25 font-sans text-sm font-medium tracking-normal num">
        {n}
      </span>
      {title}
    </h2>
  );
}

// The blocks for one assistant in one mode. The first block's Copy is the page's one primary; the rest are outline.
function ClientSetup({ client, mode, hosted, mcpUrl }: { client: string; mode: Mode; hosted: ReturnType<typeof ours>; mcpUrl: string }) {
  const note = (text: string) => <p className="max-w-prose text-sm text-muted-foreground">{text}</p>;
  if (mode === "ours") {
    switch (client) {
      case "claude":
        return (
          <>
            <Snippet primary title="Claude Code" code={hosted.claudeCode} />
            {note("Claude Desktop and claude.ai custom connectors take an address but no token yet: use Run your own there.")}
          </>
        );
      case "chatgpt":
        return note(
          "ChatGPT connects only to a public HTTPS address with no sign-in or OAuth sign-in; it doesn't take tokens. It works once the hosted address gets OAuth sign-in. Full tool use needs a Business, Enterprise or Edu workspace.",
        );
      case "gemini":
        return <Snippet primary title="Gemini CLI: ~/.gemini/settings.json" code={hosted.gemini} />;
      case "cursor":
        return (
          <>
            <Snippet primary title="Cursor: .cursor/mcp.json (project) or ~/.cursor/mcp.json" code={hosted.cursor} />
            <Snippet title="VS Code: .vscode/mcp.json" code={hosted.vscode} />
          </>
        );
      default:
        return (
          <>
            <Snippet primary title="Address (Streamable HTTP)" code={mcpUrl} />
            <Snippet title="Header your assistant sends" code={`Authorization: Bearer ${TOKEN}`} />
          </>
        );
    }
  }
  switch (client) {
    case "claude":
      return (
        <>
          <Snippet primary title="Claude Code" code={own.claudeCode} />
          <Snippet title="Claude Desktop: claude_desktop_config.json" code={own.mcpServers} />
          <Snippet title="Claude Code inside a Tourbo checkout: nothing to set up (.mcp.json registers Tourbo)" code={"claude\n> Plan a 4-show tour for Japanese Breakfast near Seattle that makes money"} />
        </>
      );
    case "chatgpt":
      return note("ChatGPT needs a public HTTPS address with OAuth sign-in, which a self-hosted Tourbo doesn't offer yet. Use another assistant on this page for now.");
    case "gemini":
      return <Snippet primary title="Gemini CLI: ~/.gemini/settings.json" code={own.mcpServers} />;
    case "cursor":
      return (
        <>
          <Snippet primary title="Cursor: .cursor/mcp.json (project) or ~/.cursor/mcp.json" code={own.mcpServers} />
          <Snippet title="VS Code: .vscode/mcp.json (asks for the key once, stores it securely)" code={own.vscode} />
        </>
      );
    default:
      return (
        <>
          <Snippet primary title="Most clients take this shape (mcpServers)" code={own.mcpServers} />
          <Snippet title="On your machine (stdio): your assistant starts this" code={own.run} />
          <Snippet title="Your own address (HTTP at http://127.0.0.1:8787/mcp, needs a token you choose)" code={own.http} />
          <Snippet title="Docker (HTTP on port 8787, health check at /healthz)" code={own.docker} />
        </>
      );
  }
}
