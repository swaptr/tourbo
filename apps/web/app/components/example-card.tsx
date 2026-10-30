import { List, Search } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { HomeExample } from "@tourbo/core/examples/types.ts";
import { rampClass } from "~/components/why-compare";
import { COMPARE_LABELS, FACT_SLOTS, LINE_SLOTS, ROUTE_SLOTS, viewOf, type CompareRow, type ExampleView } from "~/lib/example-view";
import { storyGoto, useHomeStore, useInspect, useStory } from "~/lib/home-store";

// The home page's one dialog (docked top-left, a strip above the globe on mobile): the story's
// example by default, a hovered or tapped marker's example while inspecting, or the list of all
// examples. Mounted once, fixed in size, never moves. A swap writes the new view into the hidden
// one of two fixed layers and fades that layer in on top (WAAPI opacity, compositor-only): no
// mount, no measuring, never an empty frame. Styles live in the "Example card" block of app.css.

const FADE_MS = 150;
const EASE = "cubic-bezier(.2,.8,.2,1)";

// Opacity fade with will-change only while it runs.
function fade(el: HTMLElement, from: number, to: number) {
  el.style.willChange = "opacity";
  const a = el.animate([{ opacity: from }, { opacity: to }], { duration: FADE_MS, easing: EASE });
  const done = () => (el.style.willChange = "");
  a.finished.then(done, done);
}

type Nav = { index: number; total: number; names: readonly string[]; onGoto: (i: number) => void };
type Props = {
  view: ExampleView | undefined;
  version: number; // bump when anything shown changes (the store slice's version)
  empty: string; // shown when there's no example (loading, done)
  reduced: boolean;
  active?: boolean; // showing a hovered/tapped example (not the story's)
  nav?: Nav; // position + Prev/Next (onGoto takes a ±1 step, wrapping)
  rootRef?: React.Ref<HTMLElement>;
  rootProps?: React.HTMLAttributes<HTMLElement> & { "data-testid"?: string };
  list?: React.ReactNode; // the "All examples" list (mounted on first open, then kept)
  listOpen?: boolean;
  onList?: () => void; // toggle the list
};

const same = (a: Props, b: Props) =>
  a.version === b.version &&
  a.view?.id === b.view?.id &&
  a.empty === b.empty &&
  a.reduced === b.reduced &&
  a.active === b.active &&
  a.nav?.index === b.nav?.index &&
  a.nav?.total === b.nav?.total &&
  a.list === b.list &&
  a.listOpen === b.listOpen &&
  !a.onList === !b.onList;

type Item = { key: string; view: ExampleView | undefined; empty: string };

export const ExampleCard = memo(function ExampleCard({ view, empty, reduced, active = false, nav, rootRef, rootProps, list, listOpen = false, onList }: Props) {
  // Two fixed layers; the front one is on top. New content goes into the back one, which then
  // becomes the front and fades in over the old (still fully drawn underneath).
  const key = view?.id ?? `empty:${empty}`;
  const [buf, setBuf] = useState<{ front: 0 | 1; items: [Item, Item] }>(() => {
    const it = { key, view, empty };
    return { front: 0, items: [it, it] };
  });
  const cur = buf.items[buf.front];
  if (cur.key !== key) {
    const back = (1 - buf.front) as 0 | 1;
    const items: [Item, Item] = [...buf.items];
    items[back] = { key, view, empty };
    setBuf({ front: back, items });
  } else if (cur.view !== view || cur.empty !== empty) {
    const items: [Item, Item] = [...buf.items];
    items[buf.front] = { key, view, empty };
    setBuf({ ...buf, items });
  }

  const layers = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const listLayer = useRef<HTMLDivElement>(null);
  const midBtn = useRef<HTMLButtonElement>(null);
  // The list fades over the example (opaque layer, opacity only); closing returns focus to the
  // All button, which sits in the same spot in every view.
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    const el = listLayer.current;
    if (wasOpen.current === listOpen) return;
    wasOpen.current = listOpen;
    if (el && !reduced) (listOpen ? fade(el, 0, 1) : fade(el, 1, 0));
    if (!listOpen) midBtn.current?.focus({ preventScroll: true });
  }, [listOpen, reduced]);

  const mounted = useRef(false);
  // A layer the reader scrolled is reset to the top when it comes in again (only then, so the
  // reset never forces layout on an unscrolled swap and the outgoing layer never jumps mid-fade).
  const scrolled = useRef([false, false]);
  const onScroll = useRef([() => void (scrolled.current[0] = true), () => void (scrolled.current[1] = true)]).current;
  useLayoutEffect(() => {
    // Which layer is in front is written to the DOM here, so a swap re-renders only the layer whose
    // content changed (the other keeps its props).
    layers.forEach((r, k) => {
      const el = r.current;
      if (!el) return;
      const f = k === buf.front;
      el.toggleAttribute("data-front", f);
      el.toggleAttribute("inert", !f);
      if (f) (el.removeAttribute("aria-hidden"), el.setAttribute("aria-live", "polite"));
      else (el.setAttribute("aria-hidden", "true"), el.removeAttribute("aria-live"));
    });
    if (!mounted.current) return void (mounted.current = true);
    const el = layers[buf.front].current;
    const body = el?.querySelector<HTMLElement>(".ec-body");
    if (body && scrolled.current[buf.front]) {
      body.scrollTop = 0;
      scrolled.current[buf.front] = false;
    }
    if (!el || typeof el.animate !== "function") return;
    if (!reduced) return void fade(el, 0, 1);
    // Reduced motion: an instant swap one frame later (the old layer stays drawn for that frame),
    // so reflowed text under it never counts as a layout shift.
    const hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1000 });
    requestAnimationFrame(() => requestAnimationFrame(() => hold.cancel()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buf.front]);

  const step = (d: number) => nav && nav.total > 0 && nav.onGoto(d);
  return (
    <section ref={rootRef} className="ec" data-active={active || undefined} data-list={listOpen || undefined} aria-label="Tour example" {...rootProps}>
      {active && !listOpen && <span className="ec-tag">Preview</span>}
      <div className="ec-layers">
        {buf.items.map((it, k) => (
          <Layer key={k} ref={layers[k]} item={it} onScroll={onScroll[k]} />
        ))}
        {list !== undefined && (
          <div ref={listLayer} className="ec-listlayer" data-open={listOpen || undefined} inert={!listOpen} aria-hidden={!listOpen}>
            {list}
          </div>
        )}
      </div>
      {/* Fixed control bar, identical in every view: position, then Prev / All / Next at fixed
          widths and fixed pixels. Labels never change; All is a pressed toggle. */}
      <div className="ec-foot">
        <span className="ec-footleft num text-xs text-muted-foreground">{nav && nav.total > 0 ? `${nav.index + 1} / ${nav.total}` : ""}</span>
        <button type="button" className="ec-ctl" disabled={!nav || nav.total < 1} onClick={() => step(-1)} aria-label="Previous example">
          ‹ Prev
        </button>
        <button ref={midBtn} type="button" className="ec-ctl" data-pressed={listOpen || undefined} disabled={!onList} onClick={onList} aria-label="All examples" aria-pressed={listOpen}>
          <List className="size-3.5" aria-hidden /> All
        </button>
        <button type="button" className="ec-ctl" disabled={!nav || nav.total < 1} onClick={() => step(1)} aria-label="Next example">
          Next ›
        </button>
      </div>
    </section>
  );
}, same);

const Layer = memo(function Layer({ ref, item, onScroll }: { ref: React.Ref<HTMLDivElement>; item: Item; onScroll: () => void }) {
  const v = item.view;
  return (
    <div ref={ref} className="ec-layer">
      {!v ? (
        <p className="text-sm text-muted-foreground" role="status">
          {item.empty}
        </p>
      ) : (
        <>
          {/* Keyed by its text: a new feature/byline is a new line, not the old one moving sideways
              (the byline's x depends on the feature label's width; a move would count as CLS). */}
          <p className="ec-eyebrow" key={`${v.feature}|${v.byline}`}>
            <span className="text-primary">{v.feature}</span>
            <span aria-hidden> · </span>
            <span>{v.byline}</span>
          </p>
          {/* Fixed header (above), fixed footer (outside the layers); only this body scrolls. */}
          <div className="ec-body" onScroll={onScroll}>
            <h2 className="ec-headline">{v.headline}</h2>
            <ul className="ec-facts" data-testid="example-facts">
              {Array.from({ length: FACT_SLOTS }, (_, k) => (
                <li key={k} hidden={!v.facts[k]}>
                  <span className="ec-dot" aria-hidden />
                  {v.facts[k] ?? ""}
                </li>
              ))}
            </ul>
            <Why v={v} />
          </div>
        </>
      )}
    </div>
  );
});

function Why({ v }: { v: ExampleView }) {
  const w = v.why;
  return (
    <div className="ec-why">
      <div className="grid gap-2 text-xs" data-testid="why-compare">
        <p className="text-sm">{w?.line ?? "Picked from where the fans live, the rooms that fit and the nights that pay."}</p>
        <p hidden={!w?.reason}>
          <span className="text-muted-foreground">Why {w?.skipped} was skipped: </span>
          {w?.reason ?? ""}
        </p>
        <table className="w-full table-fixed" hidden={!w}>
          <caption className="sr-only">
            {w?.chosen} compared with {w?.skipped}
          </caption>
          <thead>
            <tr className="text-left">
              <th className="w-[34%] pb-1 font-normal" scope="col">
                <span className="sr-only">Measure</span>
              </th>
              <th className="truncate pb-1 font-heading text-sm font-normal" scope="col">
                {w?.chosen}
              </th>
              <th className="truncate pb-1 font-heading text-sm font-normal text-muted-foreground" scope="col">
                {w?.skipped}
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            {(w?.rows ?? BLANK_ROWS).map((r) => (
              <tr key={r.label} className="border-t">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-muted-foreground">
                  {r.label}
                </th>
                <td className={r.chosenBetter ? "py-1 pr-3 font-medium" : "py-1 pr-3"}>
                  <Cell text={r.chosen} bar={r.chosenBar} />
                </td>
                <td className="py-1 text-muted-foreground">
                  <Cell text={r.skipped} bar={r.skippedBar} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Details v={v} />
      </div>
    </div>
  );
}

function Details({ v }: { v: ExampleView }) {
  const w = v.why;
  const d = v.details;
  return (
    <div className="ec-details">
      <ul className="grid gap-1">
        {Array.from({ length: LINE_SLOTS }, (_, k) => (
          <li key={k} hidden={!d.lines[k]} className="flex gap-2">
            <span className="ec-dot" aria-hidden />
            {d.lines[k] ?? ""}
          </li>
        ))}
      </ul>
      <div hidden={!d.route.length}>
        <p className="text-muted-foreground">The route, in play order</p>
        <ol className="mt-1 grid gap-0.5">
          {Array.from({ length: ROUTE_SLOTS }, (_, k) => {
            const r = d.route[k];
            return (
              <li key={k} hidden={!r} className="grid grid-cols-[1.25rem_1fr_auto_auto] items-baseline gap-2">
                <span className="text-muted-foreground">{r?.n}</span>
                <span className="truncate">{r?.name}</span>
                <span className="text-muted-foreground">{r?.date}</span>
                <span className={r?.loses ? "text-right text-destructive" : "text-right"}>{r?.profit}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-1 font-medium" hidden={!d.total}>
          {d.total}
        </p>
      </div>
      <p hidden={!d.losing}>{d.losing}</p>
      <p className="text-muted-foreground" hidden={!w}>
        {w?.note}
      </p>
    </div>
  );
}

const BLANK_ROWS: CompareRow[] = COMPARE_LABELS.map((label) => ({ label, chosen: "", skipped: "", chosenBetter: false }));

function Cell({ text, bar }: { text: string; bar?: number }) {
  if (bar === undefined) return <span className="block truncate">{text}</span>;
  return (
    <span className="grid grid-cols-[1fr_3ch] items-center gap-2">
      <span className="ec-track" aria-hidden>
        <span className={`ec-bar ${rampClass(bar * 100)}`} style={{ transform: `scaleX(${bar})` }} />
      </span>
      <span className="text-right">{text}</span>
    </span>
  );
}

// ---- "All examples" list (virtualised) ----

type Group = { continent: string; rows: { index: number; v: ExampleView }[] };
type VItem = { head: true; key: string; label: string; top: number } | { head: false; key: string; index: number; v: ExampleView; top: number; pos: number };

const HEAD_H = 28; // sticky continent header
const OVERSCAN = 6;

// Every example in play order, grouped by continent. Fixed row heights, so the window is computed
// from scrollTop alone: only the visible rows (+ overscan) are mounted, absolutely positioned in a
// spacer. Focus stays in the search field (combobox); arrows move the active row, Enter selects.
const ExampleList = memo(function ExampleList({ groups, total, current, open, onSelect, onClose }: { groups: Group[]; total: number; current: number; open: boolean; onSelect: (i: number) => void; onClose: () => void }) {
  const rowH = useMemo(() => (typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches ? 52 : 58), []);
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim().toLowerCase()), 100);
    return () => clearTimeout(t);
  }, [q]);

  const { items, rows, height } = useMemo(() => {
    const items: VItem[] = [];
    const rows: number[] = []; // item index of each row, in order
    let y = 0;
    for (const g of groups) {
      const hits = needle ? g.rows.filter((r) => r.v.hay.includes(needle)) : g.rows;
      if (!hits.length) continue;
      items.push({ head: true, key: `h:${g.continent}`, label: `${g.continent} · ${hits.length}`, top: y });
      y += HEAD_H;
      for (const r of hits) {
        rows.push(items.length);
        items.push({ head: false, key: r.v.id, index: r.index, v: r.v, top: y, pos: rows.length - 1 });
        y += rowH;
      }
    }
    return { items, rows, height: y };
  }, [groups, needle, rowH]);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [top, setTop] = useState(0);
  const [viewH, setViewH] = useState(360);
  const [active, setActive] = useState(0);
  // Viewport height from a ResizeObserver (no layout reads); scroll position read once per frame.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const raf = useRef(0);
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (scroller.current) setTop(scroller.current.scrollTop);
    });
  };
  const scrollTo = (y: number) => {
    const v = Math.max(0, Math.min(y, height - viewH));
    if (scroller.current) scroller.current.scrollTop = v;
    setTop(v);
  };
  const reveal = (pos: number) => {
    const it = items[rows[pos]];
    if (!it) return;
    if (it.top - HEAD_H < top) scrollTo(it.top - HEAD_H);
    else if (it.top + rowH > top + viewH) scrollTo(it.top + rowH - viewH);
  };
  // Opening: the current example is centred and active; the search field gets focus.
  useLayoutEffect(() => {
    if (!open) return;
    const pos = rows.findIndex((r) => {
      const it = items[r];
      return !it.head && it.index === current;
    });
    const p = Math.max(0, pos);
    setActive(p);
    const it = items[rows[p]];
    if (it) scrollTo(it.top - viewH / 2 + rowH / 2);
    input.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A new filter starts at the top.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) return void (first.current = false);
    setActive(0);
    scrollTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      const step = e.key.startsWith("Page") ? Math.max(1, Math.floor(viewH / rowH) - 1) : 1;
      const p = Math.max(0, Math.min(rows.length - 1, active + (e.key === "ArrowDown" || e.key === "PageDown" ? step : -step)));
      setActive(p);
      reveal(p);
    } else if (e.key === "Enter") {
      const it = items[rows[active]];
      if (it && !it.head) (e.preventDefault(), onSelect(it.index));
    }
  };

  // Window: first item at or above the top, then until the bottom, plus overscan both ways.
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top <= top) lo = mid + 1;
    else hi = mid;
  }
  const start = Math.max(0, lo - 1 - OVERSCAN);
  let end = lo;
  while (end < items.length && items[end].top < top + viewH) end++;
  end = Math.min(items.length, end + OVERSCAN);
  let sticky = "";
  for (let k = Math.min(lo - 1, items.length - 1); k >= 0; k--) {
    const it = items[k];
    if (it.head) {
      sticky = it.label;
      break;
    }
  }
  const activeId = items[rows[active]]?.key;

  return (
    <div className="ec-list" onKeyDown={onKeyDown}>
      <div className="ec-listhead">
        <h3 className="ec-listtitle">
          All examples <span className="num text-muted-foreground">· {total}</span>
        </h3>
        <label className="ec-search">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search act, city or kind"
            aria-label="Search examples"
            role="combobox"
            aria-expanded="true"
            aria-controls="ec-listbox"
            aria-activedescendant={activeId ? `ec-opt-${activeId}` : undefined}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="ec-listwrap">
        <div className="ec-group ec-sticky" hidden={!sticky} aria-hidden>
          {sticky}
        </div>
        <div ref={scroller} className="ec-body ec-listbody" id="ec-listbox" role="listbox" aria-label="All examples" onScroll={onScroll}>
          <div className="ec-spacer" style={{ height }}>
            {items.slice(start, end).map((it) =>
              it.head ? (
                <div key={it.key} className="ec-group" style={{ transform: `translateY(${it.top}px)` }} role="presentation">
                  {it.label}
                </div>
              ) : (
                <ListRow key={it.key} v={it.v} index={it.index} y={it.top} h={rowH} active={it.pos === active} current={it.index === current} onSelect={onSelect} />
              ),
            )}
          </div>
          <p className="ec-none" hidden={items.length > 0}>
            No examples match ‘{q.trim()}’
          </p>
        </div>
      </div>
    </div>
  );
});

const ListRow = memo(function ListRow({ v, index, y, h, active, current, onSelect }: { v: ExampleView; index: number; y: number; h: number; active: boolean; current: boolean; onSelect: (i: number) => void }) {
  return (
    <div
      id={`ec-opt-${v.id}`}
      role="option"
      aria-selected={active}
      aria-current={current || undefined}
      className="ec-row"
      data-active={active || undefined}
      data-current={current || undefined}
      style={{ transform: `translateY(${y}px)`, height: h }}
      onClick={() => onSelect(index)}
    >
      <span className={`ec-fanbar ${rampClass(v.fan)}`} style={{ transform: `scaleY(${Math.max(0.15, v.fan / 100)})` }} aria-hidden />
      <span className="ec-row1">
        <span className="ec-act">{v.act}</span>
        <span className="ec-chip">{v.kind}</span>
        {current && <span className="ec-now">Now showing</span>}
        <span className="ec-city">{v.city}</span>
      </span>
      <span className="ec-row2">{v.headline}</span>
    </div>
  );
});

// Groups from the precomputed views: built in idle time once the story is known; `build` forces it
// synchronously (first open before idle ran).
function useListGroups(ids: readonly string[], store: { example: (id: string) => HomeExample | undefined }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const built = useRef<readonly string[] | null>(null);
  const build = useCallback(() => {
    if (!ids.length || built.current === ids) return;
    built.current = ids;
    const by = new Map<string, Group>();
    ids.forEach((id, index) => {
      const v = viewOf(store.example(id));
      if (!v) return;
      let g = by.get(v.continent);
      if (!g) by.set(v.continent, (g = { continent: v.continent, rows: [] }));
      g.rows.push({ index, v });
    });
    setGroups([...by.values()]);
  }, [ids, store]);
  useEffect(() => {
    if (!ids.length) return;
    if (typeof requestIdleCallback !== "function") return void build();
    const h = requestIdleCallback(build, { timeout: 1500 });
    return () => cancelIdleCallback(h);
  }, [ids, build]);
  return [groups, build] as const;
}

// ---- Connected dialog (home page store) ----

// Content comes from the inspect slice (it follows the story when idle); the story slice feeds the
// controls. Pointer or focus inside keeps a hovered example (PANEL); Esc ends a preview or closes
// the list; ← / → step the tour; A toggles the list; a touch tap pins a hovered example.
export function HomeDialog({ reduced, empty }: { reduced: boolean; empty: string }) {
  const store = useHomeStore();
  const s = useStory();
  const v = useInspect();
  const names = useMemo(() => store.get().story.ids.map((id) => store.example(id)?.act.name ?? ""), [store, s.total]);
  const openRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  const toggleRef = useRef<() => void>(() => {});
  // Prev / Next always work: they close the list, end a preview (GOTO does) and step the story.
  const step = useCallback(
    (d: number) => {
      const { index, ids } = store.get().story;
      if (!ids.length) return;
      if (openRef.current) closeRef.current();
      storyGoto(store, (index + d + ids.length) % ids.length);
    },
    [store],
  );
  const nav = useMemo<Nav>(() => ({ index: s.index, total: s.total, names, onGoto: step }), [s.index, s.total, names, step]);
  const rootProps = useMemo(
    () => ({
      "data-testid": "info-panel",
      onPointerEnter: () => store.dispatch({ type: "PANEL", over: true }),
      onPointerLeave: () => store.dispatch({ type: "PANEL", over: false }),
      onFocus: () => store.dispatch({ type: "PANEL", over: true }),
      onBlur: (e: React.FocusEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && store.dispatch({ type: "PANEL", over: false }),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") return void store.dispatch({ type: "CLOSE" }); // ends a preview (the list handles its own Esc)
        if ((e.target as HTMLElement).closest("input") || e.altKey || e.ctrlKey || e.metaKey) return; // typing in search
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          step(e.key === "ArrowRight" ? 1 : -1);
        } else if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          toggleRef.current();
        }
      },
      // Reading the card never scrolls the page or zooms the globe.
      onWheel: (e: React.WheelEvent) => e.stopPropagation(),
      onPointerUp: (e: React.PointerEvent) => {
        const id = store.get().inspect.id;
        if (e.pointerType === "touch" && id && !(e.target as HTMLElement).closest("button")) store.dispatch({ type: "TAP", id });
      },
    }),
    [store, step],
  );
  // "All examples": rows built in idle time after load (or at once on the first open), mounted on
  // first open, then kept (hidden) so reopening is instant. The button shows from the first frame.
  const ids = useMemo(() => store.get().story.ids, [store, s.total]);
  const [groups, buildGroups] = useListGroups(ids, store);
  const [listOpen, setListOpen] = useState(false);
  const [listMounted, setListMounted] = useState(false);
  const toggleList = useCallback(() => {
    const o = !openRef.current;
    openRef.current = o;
    if (o) buildGroups();
    store.dispatch({ type: o ? "HOLD" : "RELEASE", reason: "list" });
    setListOpen(o);
    setListMounted(true);
  }, [store, buildGroups]);
  const closeList = useCallback(() => {
    openRef.current = false;
    setListOpen(false);
    store.dispatch({ type: "RELEASE", reason: "list" });
  }, [store]);
  const select = useCallback(
    (i: number) => {
      storyGoto(store, i);
      closeList();
    },
    [store, closeList],
  );
  closeRef.current = closeList;
  toggleRef.current = toggleList;
  const list = useMemo(
    () => (listMounted && groups ? <ExampleList groups={groups} total={ids.length} current={s.index} open={listOpen} onSelect={select} onClose={closeList} /> : undefined),
    [listMounted, groups, ids.length, s.index, listOpen, select, closeList],
  );
  return (
    <ExampleCard
      list={list}
      listOpen={listOpen}
      onList={ids.length ? toggleList : undefined}
      view={viewOf(v.example)}
      version={v.version}
      empty={s.done && s.total > 0 && !v.active ? "That's every example for now." : empty}
      reduced={reduced}
      active={v.active}
      nav={nav}
      rootProps={rootProps}
    />
  );
}
