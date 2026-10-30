import { ArrowDown, ArrowUp, Check, LoaderCircle, Plus, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import {
  addToSet,
  filterLibrary,
  minutesLabel,
  moveInSet,
  removeFromSet,
  resolveSet,
  setMinutes,
  sortLibrary,
  untimed,
  type Material,
} from "@tourbo/core/material/material.ts";
import {
  CrowdSlot,
  SetRowMeta,
  SetShape,
  startTimes,
} from "~/components/kind-tabs/set-shape";
import { ErrorLine, shownMessage } from "~/components/state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { getEventSet, listMaterial, saveEventSet } from "~/lib/material";
import { itemNoun, LABELS, setName, typeLabel } from "~/lib/labels";
import { loadProfile } from "~/lib/profile";

// An event's set (PLAN Q21): an ordered list from the act's material. Add from the library,
// reorder (buttons, or Alt+↑/↓ on a row), remove; each change saves. Read-only without the key.

type Load =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready" };
type Save =
  | { status: "idle" | "saving" | "saved" }
  | { status: "failed"; message: string };

export function EventSet({
  eventId,
  tourId,
  kind,
  canEdit,
  currency,
  onLibrary,
}: {
  eventId: string;
  tourId?: string;
  kind: string;
  canEdit: boolean;
  currency?: string; // wall / stall prices (the tour's or venue's currency)
  onLibrary?: (count: number) => void; // how many Library items there are (gates "Build my set")
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [ids, setIds] = useState<string[]>([]);
  const [items, setItems] = useState<Material[]>([]); // set items + library, by id
  const [library, setLibrary] = useState<Material[]>([]);
  const [save, setSave] = useState<Save>({ status: "idle" });
  const [q, setQ] = useState("");
  const pending = useRef<string[] | undefined>(undefined);
  const rows = useRef<Map<string, HTMLLIElement>>(new Map());

  const fetchAll = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const p = loadProfile();
      const [set, lib] = await Promise.all([
        getEventSet(eventId),
        canEdit && p?.id ? listMaterial(p.id) : Promise.resolve([]),
      ]);
      setIds(set.set.map((m) => m.id));
      setLibrary(lib);
      onLibrary?.(lib.length);
      setItems([...set.set, ...lib]);
      setLoad({ status: "ready" });
    } catch (e) {
      setLoad({
        status: "failed",
        message: shownMessage(e, "The set didn't load. Try again in a moment."),
      });
    }
  }, [eventId, canEdit]);
  useEffect(() => void fetchAll(), [fetchAll]);

  // Saves run one at a time; the latest order wins.
  const busy = useRef(false);
  async function persist(next: string[]) {
    pending.current = next;
    if (busy.current) return;
    busy.current = true;
    setSave({ status: "saving" });
    try {
      while (pending.current) {
        const send = pending.current;
        pending.current = undefined;
        await saveEventSet(eventId, send, tourId);
      }
      setSave({ status: "saved" });
    } catch (e) {
      setSave({
        status: "failed",
        message: shownMessage(e, "The set didn't save. Try again in a moment."),
      });
    } finally {
      busy.current = false;
    }
  }
  const change = (next: string[], focus?: string) => {
    setIds(next);
    void persist(next);
    if (focus) requestAnimationFrame(() => rows.current.get(focus)?.focus());
  };

  if (load.status === "loading")
    return (
      <div className="space-y-2" role="status" aria-label="Loading the set">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  if (load.status === "failed")
    return <ErrorLine boxed message={load.message} retry onRetry={fetchAll} />;

  const set = resolveSet(ids, items);
  const total = setMinutes(set);
  const noLength = untimed(set);
  const picks = sortLibrary(
    filterLibrary(
      library.filter((m) => !ids.includes(m.id)),
      { q },
    ),
  );
  const noun = itemNoun(kind, true);
  const starts = startTimes(set);
  // Crowd work goes after the bit marked opener (else after the first).
  const crowdAfter = Math.max(0, set.findIndex((m) => m.details?.marker === "opener"));

  return (
    <div
      className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      data-testid="event-set"
    >
      <section aria-labelledby={`set-${eventId}`} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`set-${eventId}`} className="mr-auto text-sm font-medium">
            {setName(kind)}{" "}
            {set.length > 0 && (
              <span className="text-muted-foreground">
                · {set.length} ·{" "}
                {total ? minutesLabel(total) : "no lengths yet"}
                {noLength && total ? ` + ${noLength} without a length` : ""}
              </span>
            )}
          </h3>
          <span
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
            data-testid="set-save"
          >
            {save.status === "saving" && (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle className="size-3 animate-spin" aria-hidden />{" "}
                Saving…
              </span>
            )}
            {save.status === "saved" && (
              <span className="inline-flex items-center gap-1">
                <Check className="size-3" aria-hidden /> Saved
              </span>
            )}
          </span>
        </div>
        {save.status === "failed" && (
          <ErrorLine
            message={save.message}
            retry
            onRetry={() => persist(ids)}
          />
        )}
        {set.length === 0 ? (
          canEdit && library.length === 0 ? null : <p
            className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
            data-testid="set-empty"
          >
            {canEdit
              ? `No ${noun} in this set yet. Add them from your ${LABELS.material.toLowerCase()}.`
              : "No set for this event yet."}
          </p>
        ) : (
          <>
            <SetShape kind={kind} items={set} currency={currency} />
            <ol
              className="divide-y rounded-xl border"
              aria-label="Set order"
              data-testid="set-list"
            >
              {set.map((m, i) => (
                <Fragment key={m.id}>
                  <li
                    ref={(el) =>
                      void (el
                        ? rows.current.set(m.id, el)
                        : rows.current.delete(m.id))
                    }
                    tabIndex={canEdit ? 0 : undefined}
                    aria-label={
                      canEdit
                        ? `${i + 1}. ${m.title}. Alt plus arrow keys to move, Delete to remove.`
                        : undefined
                    }
                    onKeyDown={
                      canEdit
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (
                              e.altKey &&
                              (e.key === "ArrowUp" || e.key === "ArrowDown")
                            ) {
                              e.preventDefault();
                              change(
                                moveInSet(ids, i, e.key === "ArrowUp" ? -1 : 1),
                                m.id,
                              );
                            } else if (
                              e.key === "Delete" ||
                              e.key === "Backspace"
                            ) {
                              e.preventDefault();
                              change(
                                removeFromSet(ids, m.id),
                                ids[i + 1] ?? ids[i - 1],
                              );
                            }
                          }
                        : undefined
                    }
                    className="flex items-center gap-2 px-3 py-1.5 outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="set-row"
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {m.title}
                    </span>
                    <SetRowMeta kind={kind} item={m} start={starts[i]} />
                    {m.origin !== "original" && (
                      <Badge variant="outline">{LABELS.origin[m.origin]}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {minutesLabel(m.lengthMin)}
                    </span>
                    {canEdit && (
                      <span className="flex shrink-0 items-center">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${m.title} up`}
                          disabled={i === 0}
                          onClick={() => change(moveInSet(ids, i, -1))}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move ${m.title} down`}
                          disabled={i === set.length - 1}
                          onClick={() => change(moveInSet(ids, i, 1))}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${m.title} from the set`}
                          onClick={() => change(removeFromSet(ids, m.id))}
                        >
                          <X />
                        </Button>
                      </span>
                    )}
                  </li>
                  {i === crowdAfter && <CrowdSlot kind={kind} />}
                </Fragment>
              ))}
            </ol>
          </>
        )}
      </section>

      {canEdit && (
        <section aria-labelledby={`pick-${eventId}`} className="space-y-2">
          <h3 id={`pick-${eventId}`} className="text-sm font-medium">
            From your {LABELS.material.toLowerCase()}
          </h3>
          {library.length === 0 ? (
            <div
              className="space-y-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
              data-testid="library-empty"
            >
              <p>Your {LABELS.material.toLowerCase()} is empty. Add your {noun} first, then build the set here.</p>
              <Button size="sm" data-primary nativeButton={false} render={<Link to="/material" />}>
                <Plus /> Add your {noun}
              </Button>
            </div>
          ) : (
            <>
              <Input
                type="search"
                aria-label="Search your material"
                placeholder="Search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {picks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {q ? "Nothing matches." : "Everything is already in the set."}
                </p>
              ) : (
                <ul
                  className="max-h-80 divide-y overflow-y-auto rounded-xl border"
                  data-testid="set-picker"
                >
                  {picks.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 px-3 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {m.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {typeLabel(kind, m.type)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {minutesLabel(m.lengthMin)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Add ${m.title} to the set`}
                        onClick={() => change(addToSet(ids, m.id))}
                      >
                        <Plus /> Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
