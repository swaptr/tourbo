import {
  Download,
  Mic,
  Music,
  Palette,
  Pencil,
  Presentation,
  Shapes,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import {
  defaultType,
  filterLibrary,
  MATERIAL_TYPES,
  minutesLabel,
  ORIGINS,
  readPasted,
  type Material,
  type MaterialFields,
  type MaterialType,
  type Origin,
} from "@tourbo/core/material/material.ts";
import { mainKind } from "@tourbo/core/profiles/profile.ts";
import {
  ConfirmLine,
  DateCol,
  EmptyState,
  FilterBar,
  ListGroup,
  ListPage,
  ListRow,
  ListState,
  NewMenu,
  RowActions,
  type FilterDef,
} from "~/components/list";
import {
  AssistButton,
  AssistPanel,
  useAssist,
  type ParseDraft,
  type TagsDraft,
} from "~/components/assist";
import { MaterialForm } from "~/components/material-form";
import { ErrorLine, shownMessage } from "~/components/state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTitle } from "~/components/ui/popover";
import { Textarea } from "~/components/ui/textarea";
import { itemNoun, LABELS } from "~/lib/labels";
import {
  createMaterial,
  deleteMaterial,
  listMaterial,
  updateMaterial,
} from "~/lib/material";
import { loadProfile } from "~/lib/profile";
import type { Route } from "./+types/material";

export function meta({}: Route.MetaArgs) {
  return [{ title: `${LABELS.material} — Tourbo` }];
}

const ICON: Record<MaterialType, typeof Music> = {
  song: Music,
  bit: Mic,
  talk: Presentation,
  piece: Palette,
  routine: Sparkles,
  other: Shapes,
};
type Sort = "title" | "length" | "added";
const SORTS: { value: Sort; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "length", label: "Length" },
  { value: "added", label: "Added" },
];
const isSort = (s: string | null): s is Sort =>
  !!s && SORTS.some((x) => x.value === s);

function sortItems(list: Material[], sort: Sort, dir: "asc" | "desc") {
  const by = (a: Material, b: Material) =>
    sort === "length"
      ? (a.lengthMin ?? -1) - (b.lengthMin ?? -1)
      : sort === "added"
        ? a.createdAt.localeCompare(b.createdAt)
        : a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  return [...list].sort((a, b) => (dir === "asc" ? by(a, b) : by(b, a)));
}

// The act's library (PLAN Q21): songs, bits, talks, pieces, reusable in any show's set. Same list
// kit as Tours and Shows (components/list): one-line toolbar, New opens a popover form, each row
// has a ⋯ menu. Yours first, then covers and local nods. Search / filters / sort in the URL.
export default function MaterialPage() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Material[]>();
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    setItems(undefined);
    const p = loadProfile();
    setKind(mainKind(p));
    if (!p?.id) return setItems([]);
    try {
      setItems(await listMaterial(p.id));
    } catch (e) {
      setError(
        shownMessage(
          e,
          `Your ${LABELS.material.toLowerCase()} didn't load. Try again in a moment.`,
        ),
      );
    }
  }, []);
  useEffect(() => void load(), [load]);

  const q = params.get("q") ?? "";
  const type = (MATERIAL_TYPES as readonly string[]).includes(
    params.get("type") ?? "",
  )
    ? (params.get("type") as MaterialType)
    : undefined;
  const origin = (ORIGINS as readonly string[]).includes(
    params.get("origin") ?? "",
  )
    ? (params.get("origin") as Origin)
    : undefined;
  const sort: Sort = isSort(params.get("sort"))
    ? (params.get("sort") as Sort)
    : "title";
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const set = (patch: Record<string, string | undefined>) =>
    setParams(
      () => {
        const p = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  const filtered = !!(q || type || origin);
  const clear = () => set({ q: undefined, type: undefined, origin: undefined });

  const shown = useMemo(
    () => sortItems(filterLibrary(items ?? [], { q, type, origin }), sort, dir),
    [items, q, type, origin, sort, dir],
  );
  const groups = ORIGINS.map((o) => ({
    origin: o,
    rows: shown.filter((m) => m.origin === o),
  })).filter((g) => g.rows.length);
  const put = (m: Material) =>
    setItems((all) => [...(all ?? []).filter((x) => x.id !== m.id), m]);
  const drop = (id: string) =>
    setItems((all) => (all ?? []).filter((x) => x.id !== id));
  const noun = itemNoun(kind);
  const nouns = itemNoun(kind, true);
  const total = items?.length ?? 0;
  const ours = items?.filter((m) => m.origin === "original").length ?? 0;

  const filters: FilterDef[] = [
    {
      key: "type",
      label: "Type",
      any: "Any type",
      value: type,
      options: MATERIAL_TYPES.map((t) => ({
        value: t,
        label: LABELS.materialType[t],
      })),
      onChange: (v) => set({ type: v }),
    },
    {
      key: "origin",
      label: "Whose",
      any: "Everything",
      value: origin,
      options: ORIGINS.map((o) => ({ value: o, label: LABELS.originGroup[o] })),
      onChange: (v) => set({ origin: v }),
    },
  ];
  const addForm = (close: () => void) => (
    <div onKeyDown={(e) => e.key === "Escape" && close()}>
      <MaterialForm
        key={kind ?? "-"}
        defaultType={defaultType(kind)}
        kind={kind}
        submitLabel="Add"
        onSave={async (f) =>
          put(await createMaterial({ ...f, kind: f.kind ?? (kind as never) }))
        }
      />
    </div>
  );

  return (
    <ListPage
      section="material"
      title={LABELS.page.material.title}
      count={
        <>
          {items && total > 0 && (
            <span className="text-foreground/80">
              {`${total} ${total === 1 ? noun : nouns}, ${ours} of your own.`}
            </span>
          )}{" "}
          {LABELS.page.material.line}
        </>
      }
      toolbar={
        <FilterBar
          q={q}
          onQ={(v) => set({ q: v || undefined })}
          placeholder={`Search ${nouns}, tags, notes`}
          filters={filters}
          sort={{
            value: sort,
            dir,
            options: SORTS,
            onChange: (s, d) =>
              set({
                sort: s === "title" ? undefined : s,
                dir:
                  s !== sort
                    ? s === "title"
                      ? undefined
                      : "desc"
                    : d === "asc"
                      ? undefined
                      : d,
              }),
          }}
          onClear={clear}
          menu={
            <RowActions
              label="More actions"
              size="icon"
              actions={[
                {
                  label: `Export my ${nouns}`,
                  icon: <Download />,
                  onSelect: () => exportLibrary(items ?? [], nouns),
                  disabled: !items?.length,
                },
              ]}
            />
          }
          newMenu={
            <NewMenu
              items={[
                {
                  label: `Add a ${noun}`,
                  title: `Add a ${noun}`,
                  form: addForm,
                },
                // Mount point for the AI tidy-up (components/assist); the plain form works without it.
                {
                  label: "Paste a list",
                  title: `Paste your ${nouns}`,
                  form: (close) => (
                    <PasteForm
                      noun={noun}
                      kind={kind}
                      onAdded={put}
                      onDone={close}
                    />
                  ),
                },
              ]}
            />
          }
        />
      }
    >
      <ListState
        error={error}
        onRetry={() => void load()}
        loading={!items && !error}
        empty={
          shown.length === 0 &&
          (filtered && total > 0 ? (
            <EmptyState
              title="Nothing matches."
              action={
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              }
              testId="material-empty"
            />
          ) : (
            <EmptyState
              title={LABELS.empty.material.title}
              body={LABELS.empty.material.body}
              testId="material-empty"
              action={
                // Opens the same New menu (Add one / Paste a list) as the toolbar.
                <Button
                  variant="outline"
                  onClick={() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        '[data-testid="new-menu"]',
                      )
                      ?.click()
                  }
                >
                  Add your first {noun}
                </Button>
              }
            />
          ))
        }
      >
        {items && <TagLine items={items} kind={kind} onSaved={put} />}
        {groups.map((g) => (
          <ListGroup
            key={g.origin}
            title={
              groups.length > 1 || g.origin !== "original"
                ? LABELS.originGroup[g.origin]
                : undefined
            }
          >
            {g.rows.map((m) => (
              <MaterialRow
                key={m.id}
                m={m}
                onSaved={put}
                onDeleted={drop}
                kind={kind}
              />
            ))}
          </ListGroup>
        ))}
      </ListState>
    </ListPage>
  );
}

function MaterialRow({
  m,
  onSaved,
  onDeleted,
  kind,
}: {
  m: Material;
  onSaved: (m: Material) => void;
  onDeleted: (id: string) => void;
  kind?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const anchor = useRef<HTMLSpanElement>(null);
  const Icon = ICON[m.type];
  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteMaterial(m.id);
      onDeleted(m.id);
    } catch (e) {
      setError(shownMessage(e, "That didn't delete. Try again in a moment."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ListRow
      testId="material-row"
      data-origin={m.origin}
      icon={<Icon />}
      lead={
        m.lengthMin !== undefined ? (
          <DateCol
            top="min"
            big={minutesLabel(m.lengthMin).replace(/\s*min$/, "")}
          />
        ) : undefined
      }
      title={m.title}
      meta={[LABELS.materialType[m.type], m.tags.join(", "), m.notes]
        .filter(Boolean)
        .join(" · ")}
      figure={
        <span
          className={m.uses ? "num text-sm" : "text-sm text-muted-foreground"}
          title="Shows whose set has it"
        >
          {m.uses
            ? `in ${m.uses} set${m.uses === 1 ? "" : "s"}`
            : "not in a set"}
        </span>
      }
      pill={
        m.origin === "local_idea" && (
          <Badge variant="outline">
            {m.origin === "local_idea" && m.source?.city
              ? `${LABELS.origin.local_idea} · ${m.source.city.split(",")[0]}`
              : LABELS.origin[m.origin]}
          </Badge>
        )
      }
      menu={
        <span ref={anchor} className="shrink-0">
          <RowActions
            label={`Actions for ${m.title}`}
            actions={[
              {
                label: "Edit",
                icon: <Pencil />,
                onSelect: () => setEditing(true),
                disabled: busy,
              },
              {
                label: "Delete…",
                icon: <Trash2 />,
                onSelect: () => setConfirming(true),
                destructive: true,
                disabled: busy,
              },
            ]}
          />
          <Popover open={editing} onOpenChange={setEditing}>
            <PopoverContent
              anchor={anchor}
              align="end"
              className="w-[min(24rem,calc(100vw-2rem))] p-3"
              data-testid="edit-form"
            >
              <PopoverTitle className="font-heading text-lg">
                Edit {itemNoun(kind)}
              </PopoverTitle>
              {editing && (
                <MaterialForm
                  initial={m}
                  defaultType={defaultType(kind)}
                  kind={m.kind ?? kind}
                  submitLabel="Save"
                  onCancel={() => setEditing(false)}
                  onSave={async (f) => {
                    onSaved(await updateMaterial(m.id, f));
                    setEditing(false);
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
        </span>
      }
      below={
        confirming ? (
          <div className="space-y-1">
            <ConfirmLine
              text={`Delete “${m.title}” for good?`}
              confirm="Delete"
              busy={busy}
              onConfirm={() => void remove()}
              onCancel={() => setConfirming(false)}
            />
            <p className="text-xs text-muted-foreground">
              It also comes out of every set it's in.
            </p>
          </div>
        ) : error ? (
          <ErrorLine message={error} />
        ) : undefined
      }
    />
  );
}

function PasteForm({
  noun,
  kind,
  onAdded,
  onDone,
}: {
  noun: string;
  kind?: string;
  onAdded: (m: Material) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const read = useAssist<ParseDraft>("library_parse");
  const rows = readPasted(text);
  const nouns = itemNoun(kind, true);
  // Saves one by one so a failure says how far it got.
  const saveAll = async (list: MaterialFields[]) => {
    setBusy(true);
    setError(undefined);
    let added = 0;
    try {
      for (const f of list) {
        onAdded(await createMaterial(f));
        added++;
      }
      onDone();
    } catch (err) {
      setError(
        shownMessage(
          err,
          `Added ${added} of ${list.length}. Try again for the rest in a moment.`,
        ),
      );
      throw err;
    } finally {
      setBusy(false);
    }
  };
  const plain = () =>
    rows.map((r): MaterialFields => ({
      title: r.title,
      lengthMin: r.lengthMin,
      type: defaultType(kind),
      kind: kind as never,
      tags: [],
      origin: "original",
    }));
  return (
    <form
      className="grid gap-2"
      noValidate
      data-testid="paste-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rows.length)
          return setError(`Paste at least one ${noun}, one per line.`);
        setError(undefined);
        void read.run({ text, kind });
      }}
    >
      <Label htmlFor="paste">
        Paste a setlist, notes, anything. One per line is easiest.
      </Label>
      <Textarea
        id="paste"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "Harbour Lights 4:30\nPaper Moon (cover, Ella Fitzgerald)\nSlow Train"
        }
        aria-invalid={!!error}
        autoFocus
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {read.status !== "idle" ? (
        <AssistPanel<ParseDraft>
          heading="From your list"
          state={read}
          isEmpty={(d) => !d.items.length}
          empty={`No ${nouns} found in that. Try one per line.`}
          render={(d) => (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {d.items.map((it) => (
                <li key={it.line} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  {it.origin !== "original" && (
                    <Badge variant="outline">{LABELS.origin[it.origin]}</Badge>
                  )}
                  {it.lengthMin !== undefined && (
                    <span className="num text-xs text-muted-foreground">
                      {minutesLabel(it.lengthMin)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          keepLabel={busy ? "Adding…" : "Add them"}
          onKeep={(d) =>
            saveAll(
              d.items.map((it) => ({
                title: it.title,
                type: it.type,
                lengthMin: it.lengthMin,
                origin: it.origin,
                tags: it.tags,
                notes: it.by ? `by ${it.by}` : undefined,
                kind: kind as never,
              })),
            )
          }
          onDiscard={read.reset}
          onRetry={() => void read.run({ text, kind })}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !rows.length}
            onClick={() => void saveAll(plain()).catch(() => {})}
          >
            Add as typed
          </Button>
          <Button type="submit" disabled={busy}>
            <Sparkles /> Read my list
          </Button>
        </div>
      )}
    </form>
  );
}

// Untagged items: one quiet line offering tags (mood, energy, topics) from the titles and notes.
function TagLine({
  items,
  kind,
  onSaved,
}: {
  items: Material[];
  kind?: string;
  onSaved: (m: Material) => void;
}) {
  const untagged = items.filter((m) => !m.tags.length).slice(0, 40);
  if (untagged.length < 2) return null;
  return (
    <p
      className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      data-testid="tag-line"
    >
      {untagged.length} {itemNoun(kind, true)} have no tags yet. Tags help
      Tourbo pick a set for each room.
      <AssistButton<TagsDraft>
        task="library_tags"
        input={() => ({
          items: untagged.map(({ title, notes, tags }) => ({
            title,
            notes,
            tags,
          })),
          kind,
        })}
        label="Tag these"
        heading="Suggested tags"
        size="sm"
        render={(d) => (
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {d.items.map((it) => (
              <li key={it.title} className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-medium">{it.title}</span>
                {it.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        )}
        isEmpty={(d) => !d.items.some((it) => it.tags.length)}
        keepLabel="Save tags"
        onKeep={async (d) => {
          for (const it of d.items) {
            const m = untagged.find((x) => x.title === it.title);
            if (!m || !it.tags.length) continue;
            const { id, profileId, createdAt, updatedAt, uses, ...fields } = m;
            onSaved({
              ...(await updateMaterial(id, {
                ...fields,
                tags: it.tags.slice(0, 12),
              })),
              uses,
            });
          }
        }}
      />
    </p>
  );
}

// The library as plain text (one per line, length and whose), to paste anywhere.
function exportLibrary(items: Material[], nouns: string) {
  const lines = [...items]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((m) =>
      [
        m.title,
        m.lengthMin !== undefined ? minutesLabel(m.lengthMin) : "",
        m.origin !== "original" ? LABELS.origin[m.origin] : "",
        m.notes ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  const blob = new Blob([`Your ${nouns}\n\n${lines.join("\n")}\n`], {
    type: "text/plain",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tourbo-${nouns}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}
