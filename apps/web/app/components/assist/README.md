# AI assists (PLAN Q21)

Rules first, fan data as evidence, the AI only fills gaps or shortens a line (critic-checked). Drafts are never applied until **Keep**. Owner key of the run (if the browser has it) or of the act profile rides along automatically; others get Tourbo's plain draft. AI off/limited → same draft + `notice`.

```ts
import { AssistButton, AssistPanel, InsightLine, useAssist, callAssist, forgetRowInsight } from "~/components/assist";
import type { ParseDraft, TagsDraft, TitleDraft, BuildSetDraft, ProfileDraft } from "~/components/assist";
```

Every response: `{ draft, evidence[], source: "fan data" | "ai" | "rules", notice?, limited?, cached? }`. Server: `POST /api/assist { task, input, profileId? }`.

| task | input | draft |
|---|---|---|
| `library_parse` | `{ text, kind? }` | `{ items: ParsedItem[], unread, skipped }` (item: title, type, lengthMin?, origin, by?, tags, guess?) |
| `library_tags` | `{ items: { title, notes?, tags? }[], kind? }` | `{ items: { title, mood[], energy?, topics[], tags[] }[] }` — save `tags` |
| `title` | `{ runId }` or `{ kind, mode, cities[], startDate?, region? }`, `ai?: true` for alternatives | `{ title, alternatives[] }` |
| `row_insight` | `{ runIds[] }` (use `<InsightLine>`, it batches) | `{ rows: { runId, line, evidence, source }[] }` |
| `build_set` | `{ eventId }` or `{ runId, city }`, `slot?`, `minutes?`, `items?` (default: the profile's library) | `SetDraft` (`order[]`: materialId?, title, minutes, role, reason, chip, isNew?) |
| `profile_suggest` | `{ name, genres? }` (genres from `/api/resolve`) | `{ kinds[], home?, homeFrom? }` |

One-liners:

```tsx
// Library: paste → items (Keep = createMaterial for each)
<AssistButton<ParseDraft> task="library_parse" input={() => ({ text, kind })} label="Read my list" render={(d) => <ul>{d.items.map((i) => <li key={i.line}>{i.title}</li>)}</ul>} isEmpty={(d) => !d.items.length} onKeep={(d) => saveAll(d.items)} />

// Library: auto-tags for selected items
<AssistButton<TagsDraft> task="library_tags" input={{ items: selected.map(({ title, notes, tags }) => ({ title, notes, tags })), kind }} label="Tag these" render={...} onKeep={(d) => applyTags(d.items)} />

// Tours / shows: title (in the New form; onEdit fills the field)
<AssistButton<TitleDraft> task="title" input={() => ({ kind, mode: "event", cities: [city], startDate, ai: true })} label="Suggest a title" render={(d) => <p className="font-medium">{d.title}</p>} onKeep={(d) => setTitle(d.title)} onEdit={(d) => setTitle(d.title)} />

// List rows: one line of fan-data insight
<InsightLine runId={tour.runId} />

// A night / show: Build my set (Keep = saveEventSet(eventId, ids))
<AssistButton<BuildSetDraft> task="build_set" input={{ eventId }} label="Build my set" render={(d) => <ol>{d.order.map((e, i) => <li key={i}>{e.title} · {e.reason}</li>)}</ol>} onKeep={(d) => saveEventSet(eventId, d.order.flatMap((e) => e.materialId ?? []))} />

// Profile: suggest kinds + home base after "Is this you?"
<AssistButton<ProfileDraft> task="profile_suggest" input={{ name, genres: act.genres }} label="Fill from my act" render={...} onKeep={(d) => apply(d)} />
```

Inline (no popover), e.g. under a paste box: `const a = useAssist<ParseDraft>("library_parse"); a.run({ text, kind })` then `<AssistPanel heading="From your list" state={a} render={...} onKeep={...} onDiscard={a.reset} onRetry={() => a.run(...)} />`.

`build_set` nods with `isNew: true` aren't in the library yet: keep them with `keepIdeaAsMaterial` first, or drop them. After a tour edit call `forgetRowInsight(runId)`.
