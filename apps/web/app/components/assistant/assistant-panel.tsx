import { ArrowUp, ChevronDown, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import type { Proposal } from "@tourbo/core/engine/proposals.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { ErrorLine, LoadingLines } from "~/components/state";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { useCanEdit } from "~/components/your-work";
import { neutral } from "~/lib/neutral";
import { cn } from "~/lib/utils";
import { ProposalCard } from "./proposal-card";
import { patch, type ChatMessage, useAssistant } from "./store";
import { ownerHeaders } from "~/lib/work";

const FAILED = "Something went wrong answering that. Try again.";

// Ask Tourbo (PLAN §18 Q20): a short chat scoped to one plan (runId) or one city (/ideas: city +
// kind, optional `facts` = what the page already shows). Replies stream in; suggested changes come
// back as cards with Apply / Discard (owner only). Shared links read the history, can't write.
//   <AssistantPanel runId={run.id} plan={run.plan} />           plan workspace side panel
//   <AssistantPanel city="Austin" kind="musician" facts={…} />  /ideas
type Event =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; message: ChatMessage; left: number }
  | { type: "error"; text: string; retry: boolean };

export function AssistantPanel({
  runId,
  plan,
  city,
  kind,
  region,
  act,
  facts,
  onClose,
  className,
}: {
  runId?: string;
  plan?: Plan | null;
  city?: string;
  kind?: string;
  region?: string;
  act?: string;
  facts?: string;
  onClose?: () => void; // docked in the tour's night panel: fold back to the composer
  className?: string;
}) {
  const a = useAssistant({ runId, city });
  const canEdit = useCanEdit(runId ?? "", !!a.state?.owned);
  const [local, setLocal] = useState<ChatMessage[]>([]); // this session, when there's no run to save to
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; text: string; status?: string; cards: Proposal[] }>();
  const [error, setError] = useState<{ text: string; retry: boolean; question: string }>();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const history = runId ? (a.state?.history ?? []) : local;
  const proposals = new Map((a.state?.proposals ?? []).map((p) => [p.id, p]));
  const writable = !runId || canEdit;
  const ai = a.state?.ai ?? false;
  const left = a.state?.left ?? 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [history.length, pending?.text, pending?.cards.length]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    setError(undefined);
    setDraft("");
    setPending({ question: q, text: "", cards: [] });
    const now = new Date().toISOString();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(runId ? ownerHeaders(runId) : {}) },
        body: JSON.stringify({ intent: "ask", message: q, ...(runId ? { runId } : { city, kind, region, act, facts }) }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; retry?: boolean };
        throw Object.assign(new Error(body.error ?? FAILED), { plain: true, retry: body.retry ?? (res.status !== 403 && res.status !== 429) });
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6)) as Event;
          if (e.type === "delta") setPending((p) => p && { ...p, text: p.text + e.text, status: undefined });
          else if (e.type === "reset") setPending((p) => p && { ...p, text: "" });
          else if (e.type === "status") setPending((p) => p && { ...p, status: e.text });
          else if (e.type === "proposal") {
            setPending((p) => p && { ...p, cards: [...p.cards, e.proposal] });
            if (runId) patch(runId, (s) => ({ ...s, proposals: [...(s.proposals ?? []), e.proposal] }));
          } else if (e.type === "error") {
            setError({ text: e.text, retry: e.retry, question: q });
            if (!e.retry && /off on this server/.test(e.text) && runId) patch(runId, (s) => ({ ...s, ai: false, off: e.text }));
          } else if (e.type === "done") {
            const user: ChatMessage = { id: `u-${e.message.id}`, role: "user", text: q, at: now };
            if (runId) patch(runId, (s) => ({ ...s, left: e.left, history: [...(s.history ?? []), user, e.message] }));
            else {
              setLocal((l) => [...l, user, e.message]);
              a.patch((s) => ({ ...s, left: e.left }));
            }
          }
        }
      }
    } catch (e) {
      // Only server sentences are shown; a network or parse failure reads as the plain fallback.
      const plain = (e as { plain?: boolean }).plain && e instanceof Error;
      setError({ text: plain ? e.message : FAILED, retry: (e as { retry?: boolean }).retry ?? true, question: q });
    } finally {
      setPending(undefined);
      input.current?.focus();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  };

  const suggestions = suggestionsFor(plan, city, kind);

  return (
    <section className={cn("flex min-h-0 flex-col gap-3", className)} aria-label="Ask Tourbo">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <MessageCircle className="size-4" /> Ask Tourbo
        </h2>
        <span className="flex items-center gap-2">
          {ai && writable && left > 0 && left <= 5 && <span className="text-xs text-muted-foreground">{left} question{left === 1 ? "" : "s"} left today</span>}
          {onClose && (
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Fold the chat" aria-keyshortcuts="Escape" onClick={onClose}>
              <ChevronDown />
            </Button>
          )}
        </span>
      </header>

      {a.loading && !a.state ? (
        <LoadingLines lines={3} label="Loading the conversation" />
      ) : a.error && !a.state ? (
        <ErrorLine message={a.error} retry onRetry={a.reload} />
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-3 pr-2" role="log" aria-live="polite" aria-relevant="additions">
              {!history.length && !pending && (
                <p className="text-sm text-muted-foreground">
                  {runId ? "Ask about any night, the money or the route. Tourbo suggests changes; you decide." : `Ask what to play, say or make in ${city ?? "this city"}.`}
                </p>
              )}
              {history.map((m) => (
                <Bubble key={m.id} message={m}>
                  {runId &&
                    m.proposals?.map((id) => {
                      const p = proposals.get(id);
                      return p ? <ProposalCard key={id} runId={runId} proposal={p} canEdit={canEdit} /> : null;
                    })}
                </Bubble>
              ))}
              {pending && (
                <>
                  <Bubble message={{ id: "q", role: "user", text: pending.question, at: "" }} />
                  <div className="grid gap-2">
                    {pending.text ? (
                      <p className="text-sm leading-relaxed">{neutral(pending.text)}</p>
                    ) : (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                        <Dots /> {pending.status ?? "Thinking…"}
                      </p>
                    )}
                    {runId && pending.cards.map((p) => <ProposalCard key={p.id} runId={runId} proposal={proposals.get(p.id) ?? p} canEdit={canEdit} />)}
                  </div>
                </>
              )}
              {error && <ErrorLine message={error.text} retry={error.retry} onRetry={() => void ask(error.question)} busy={!!pending} />}
              <div ref={end} />
            </div>
          </ScrollArea>

          {!ai ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{a.state?.off ?? "Ask Tourbo is off on this server. The levers and questions still work."}</p>
          ) : !writable ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">You're viewing a shared plan: read-only. Open it in the browser that made it to ask Tourbo.</p>
          ) : left <= 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">That's today's questions. The levers still work; ask again tomorrow.</p>
          ) : (
            <>
              {!history.length && !pending && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <Button key={s} type="button" size="xs" variant="outline" onClick={() => void ask(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              )}
              <form onSubmit={submit} className="relative">
                <label htmlFor="ask-tourbo" className="sr-only">
                  Your question
                </label>
                <Textarea
                  id="ask-tourbo"
                  ref={input}
                  autoFocus={!!onClose}
                  value={draft}
                  maxLength={500}
                  rows={2}
                  placeholder={runId ? "Why not another city? Make it cheaper…" : "What should I play here?"}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  disabled={!!pending}
                  className="min-h-12 resize-none pr-11"
                />
                <Button type="submit" size="icon-sm" className="absolute right-2 bottom-2" disabled={!draft.trim() || !!pending} aria-label="Send">
                  <ArrowUp />
                </Button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Bubble({ message, children }: { message: ChatMessage; children?: React.ReactNode }) {
  const user = message.role === "user";
  return (
    <div className={cn("grid gap-2", user && "justify-items-end")}>
      <p className={cn("max-w-[85%] text-sm leading-relaxed", user ? "rounded-2xl rounded-br-sm bg-muted px-3 py-2" : "")}>{user ? message.text : neutral(message.text)}</p>
      {children}
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

// Starter questions from what's on screen (names only from the plan).
function suggestionsFor(plan?: Plan | null, city?: string, kind?: string): string[] {
  if (!plan) return city ? [`What should I play in ${city}?`, kind === "comedian" ? "Any topics to avoid here?" : "Something local to nod to?"] : [];
  const played = plan.stops.filter((s) => s.money?.verdict !== "skip");
  const first = played[0]?.city.name;
  const talk = ["comedian", "speaker", "poet", "podcaster"].includes(plan.artist.kind);
  return [
    "Make it cheaper",
    ...(first ? [`Add a night near ${first}`] : []),
    talk ? `Topics to avoid in ${played.at(-1)?.city.name ?? "these cities"}?` : "More 90s covers",
  ];
}
