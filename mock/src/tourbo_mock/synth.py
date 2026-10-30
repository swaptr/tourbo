"""Deterministic answers in the real response shapes, seeded by the request. Names come from
real saved entities (store.pool); places from the app's cities table."""

import copy
import hashlib
import json
import math
import os
import re
import threading

from . import store

B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def h(s: str) -> int:
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big")


def unit(s: str) -> float:
    return (h(s) % 1_000_000) / 1_000_000


def rnd(x: float, d: int = 6) -> float:
    return round(x, d)


def uid(s: str) -> str:
    x = hashlib.sha256(s.encode()).hexdigest().upper()
    return f"{x[:8]}-{x[8:12]}-4{x[13:16]}-8{x[17:20]}-{x[20:32]}"


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") or "x"


def geohash(lat: float, lon: float, precision: int = 7) -> str:
    lat_r, lon_r, out, bit, ch, even = [-90.0, 90.0], [-180.0, 180.0], "", 0, 0, True
    while len(out) < precision:
        r, v = (lon_r, lon) if even else (lat_r, lat)
        mid = (r[0] + r[1]) / 2
        if v >= mid:
            ch, r[0] = (ch << 1) | 1, mid
        else:
            ch, r[1] = ch << 1, mid
        even = not even
        bit += 1
        if bit == 5:
            out, bit, ch = out + B32[ch], 0, 0
    return out


def geohash_center(gh: str):
    lat_r, lon_r, even = [-90.0, 90.0], [-180.0, 180.0], True
    for c in gh:
        v = B32.find(c)
        for b in range(4, -1, -1):
            r = lon_r if even else lat_r
            mid = (r[0] + r[1]) / 2
            if (v >> b) & 1:
                r[0] = mid
            else:
                r[1] = mid
            even = not even
    return (lat_r[0] + lat_r[1]) / 2, (lon_r[0] + lon_r[1]) / 2


# ---------- places ----------
def places(text: str | None):
    """[(name, lat, lon, weight)] for a location query: a city, or a country's biggest cities."""
    if not text:
        return []
    q = text.strip().lower()
    head, _, rest = (p.strip() for p in q.partition(","))
    rows = store.cities()
    country = [r for r in rows if (r[4] or "").lower() == q or (r[3] or "").lower() == q]
    if country:
        return [(r[0], r[5], r[6], r[7] or 1) for r in country[:8]]
    head = {"new york city": "new york", "washington, d.c.": "washington"}.get(q, head)
    hits = [r for r in rows if head in ((r[0] or "").lower(), (r[1] or "").lower())]
    if rest:
        hits = [r for r in hits if rest in ((r[2] or "").lower(), (r[3] or "").lower(), (r[4] or "").lower(), "d.c.")] or hits
    if hits:
        return [(hits[0][0], hits[0][5], hits[0][6], 1)]
    return places(rest) if rest else []  # small town not in the table: its region or country


def point_of(p: dict):
    m = re.match(r"POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)", p.get("filter.location", ""), re.I)
    if m:
        return [("point", float(m.group(2)), float(m.group(1)), 1)]
    if p.get("filter.location.geohash"):
        lat, lon = geohash_center(p["filter.location.geohash"])
        return [(p["filter.location.geohash"], lat, lon, 1)]
    return places(p.get("filter.location.query") or p.get("signal.location.query"))


def localities(p: dict, at):
    if not at:
        return {}
    which = "filter" if p.get("filter.location.query") else "signal"
    name = p.get("filter.location.query") or p.get("signal.location.query") or at[0][0]
    loc = {"name": name.split(",")[0], "subtype": "urn:entity:locality", "location": {"lat": at[0][1], "lon": at[0][2]},
           "entity_id": uid(f"locality:{name}"), "popularity": rnd(0.9 + 0.1 * unit(name)), "disambiguation": name}
    return {"query": {"localities": {which: [loc] if which == "filter" else loc}}}


def seed_of(p: dict) -> str:
    return "|".join(p.get(k, "") for k in ("signal.interests.entities", "signal.interests.tags", "signal.location.query",
                                           "filter.location.query", "filter.location", "filter.location.geohash", "filter.tags", "bias.trends"))


def heatmap(p: dict):
    at = point_of(p)
    seed = seed_of(p)
    total = sum(w for *_, w in at) or 1
    cells = []
    for name, lat, lon, w in at:
        n = max(3, round((40 + h(seed + name) % 60) * (w / total) ** 0.5))
        spread = 0.25 if len(at) == 1 else 0.12
        for i in range(n):
            s = f"{seed}|{name}|{i}"
            la = lat + (unit(s + "y") - 0.5) * spread
            lo = lon + (unit(s + "x") - 0.5) * spread / max(0.2, math.cos(math.radians(lat)))
            cells.append((la, lo, unit(s + "a") ** 1.5 * (0.6 + 0.4 * (w / total) ** 0.3), unit(s + "r")))
    top = max((c[2] for c in cells), default=1) or 1
    cells.sort(key=lambda c: -c[2])
    out = []
    for la, lo, a, r in cells:
        a = rnd(a / top, 6)
        rank = rnd(0.3 + 0.69 * r, 6)
        out.append({"query": {"affinity": a, "popularity": a, "affinity_rank": rank}, "location": {"geohash": geohash(la, lo, 7), "latitude": rnd(la), "longitude": rnd(lo)}})
    return {**localities(p, at), "results": {"heatmap": out}, "success": True}


def demographics(p: dict):
    seed = json.dumps(p, sort_keys=True)
    b = lambda k: round(unit(f"{seed}|{k}") * 0.8 - 0.4, 2)  # noqa: E731
    m = b("m")
    return {"results": {"demographics": [{"query": {
        "age": {"24_and_younger": b("a1"), "25_to_29": b("a2"), "30_to_34": b("a3"), "35_to_44": b("a4"), "45_to_54": b("a5"), "55_and_older": b("a6")},
        "gender": {"male": m, "female": -m}}, "entity_id": p.get("signal.interests.entities", "").split(",")[0] or uid(seed)}]}, "success": True}


FALLBACK_SLOTS = {"urn:entity:place": "/v2/insights|urn:entity:place|", "urn:entity:person": "/search", "urn:entity:artist": "/search"}


def entity_pool(etype: str, tag: str = "") -> list[dict]:
    slot = f"/v2/insights|{etype}|{tag}"
    got = store.pool(slot)
    if not got and tag:
        got = [e for e in store.pool(f"/v2/insights|{etype}|")]
        if not got:  # any saved place list, whatever its tag
            got = next((store.pool(s) for s in store.INDEX.by_type if s.startswith(f"/v2/insights|{etype}|")), [])
    if not got:
        got = [e for e in store.pool("/search") if etype in (e.get("types") or [e.get("subtype")])]
    return got


def ranked(items: list[dict], seed: str, take: int, place=None):
    order = sorted(items, key=lambda e: unit(f"{seed}|{e['entity_id']}"))[:take]
    out = []
    for i, e in enumerate(order):
        e = copy.deepcopy(e)
        a = rnd(1 - i / max(take, 1) * (0.5 + 0.4 * unit(seed + "spread")), 6)
        e["query"] = {**(e.get("query") or {}), "affinity": a}
        if place:
            name, lat, lon, _ = place
            la = lat + (unit(f"{seed}|{i}|y") - 0.5) * 0.04
            lo = lon + (unit(f"{seed}|{i}|x") - 0.5) * 0.04
            e["location"] = {"lat": rnd(la), "lon": rnd(lo), "geohash": geohash(la, lo, 9)}
            props = dict(e.get("properties") or {})
            for k in ("address", "neighborhood", "phone", "website", "geocode", "hours"):
                props.pop(k, None)
            e["properties"] = props
            e["query"]["distance"] = round(unit(f"{seed}|{i}|d") * 3000)
        out.append(e)
    return out


def entities_insight(p: dict, take: int):
    etype = p.get("filter.type", "urn:entity:artist")
    seed = seed_of(p)
    tag = p.get("filter.tags", "").split(",")[0] if etype == "urn:entity:place" else ""
    pool = entity_pool(etype, tag)
    exclude = set(filter(None, p.get("filter.exclude.entities", "").split(",")))
    only = list(filter(None, p.get("filter.results.entities", "").split(",")))
    if only:
        known = {e["entity_id"]: e for e in pool}
        stand_in = lambda i: {**sorted(pool, key=lambda e: unit(i + e["entity_id"]))[0], "entity_id": i} if pool else {"name": "Local favourite", "entity_id": i, "type": "urn:entity", "subtype": etype}  # noqa: E731
        pool = [known.get(i) or by_id(i) or stand_in(i) for i in only]
    pool = [e for e in pool if e["entity_id"] not in exclude]
    place = None
    if etype == "urn:entity:place":
        at = point_of(p)
        if not at:
            return {"results": {"entities": []}, "success": True}
        place = at[0]
    return {**localities(p, point_of(p) if place else []), "results": {"entities": ranked(pool, seed, take, place)}, "success": True}


def all_tags():
    seen, out = set(), []
    for slot in ("/search", "/v2/insights|urn:entity:artist|", "/v2/insights|urn:entity:tv_show|", "/v2/insights|urn:entity:podcast|"):
        for e in store.pool(slot):
            for t in e.get("tags") or []:
                tid = t.get("tag_id") or t.get("id") or t.get("value")
                if tid and tid not in seen and tid.startswith("urn:tag:"):
                    seen.add(tid)
                    out.append({"id": tid, "name": t.get("name") or tid.split(":")[-1], "type": t.get("type") or ":".join(tid.split(":")[:3])})
    return out


def insight_tags(p: dict, take: int):
    seed = seed_of(p)
    tags = sorted(all_tags(), key=lambda t: unit(f"{seed}|{t['id']}"))[:take]
    return {"results": {"tags": [{"tag_id": t["id"], "id": t["id"], "name": t["name"], "type": t["type"],
                                  "query": {"affinity": rnd(1 - i / max(take, 1) * 0.7)}} for i, t in enumerate(tags)]}, "success": True}


def insights(p: dict):
    t = p.get("filter.type", "urn:entity:artist")
    take = min(int(p.get("take", "20") or 20), 50) if (p.get("take") or "20").isdigit() else 20
    if t == "urn:heatmap":
        return heatmap(p)
    if t == "urn:demographics":
        return demographics(p)
    if t == "urn:tag":
        return insight_tags(p, take)
    return entities_insight(p, take)


# ---------- search / entities ----------
_reg_lock = threading.Lock()
REG_FILE = store.CACHE_DIR / "synthetic-entities.json"
_registry: dict[str, dict] | None = None


def registry():
    global _registry
    if _registry is None:
        try:
            _registry = json.loads(REG_FILE.read_text())
        except (OSError, ValueError):
            _registry = {}
    return _registry


def remember(e: dict):
    with _reg_lock:
        reg = registry()
        if e["entity_id"] not in reg:
            reg[e["entity_id"]] = e
            store.CACHE_DIR.mkdir(exist_ok=True)
            REG_FILE.write_text(json.dumps(reg))


GENRE = {"urn:entity:artist": ["pop", "indie", "rock", "folk", "electronic", "hip_hop", "jazz", "soul"],
         "urn:entity:person": ["comedy", "stand_up", "performance"]}


def made_up(name: str, etype: str) -> dict:
    g = GENRE.get(etype, ["culture"])
    picks = sorted(g, key=lambda x: unit(f"{name}|{x}"))[:2]
    kind = {"urn:entity:artist": "musician", "urn:entity:person": "performer"}.get(etype, etype.split(":")[-1].replace("_", " "))
    e = {"name": name, "entity_id": uid(f"mock:{etype}:{name.lower()}"), "type": "urn:entity", "types": [etype], "subtype": etype,
         "popularity": rnd(0.5 + 0.45 * unit(name)),
         "tags": [{"name": x.replace("_", " ").title(), "type": "urn:tag:genre", "value": f"urn:tag:genre:{x}", "tag_id": f"urn:tag:genre:{x}"} for x in picks],
         "properties": {"short_description": f"{name}, {kind}", "short_descriptions": [{"value": f"{name}, {kind}", "languages": ["en"]}]},
         "disambiguation": kind}
    remember(e)
    return e


def norm(s: str) -> str:
    return re.sub(r"[^\w]+", " ", s.lower()).strip()


def search(p: dict):
    q = (p.get("query") or "").strip()
    types = [t for t in (p.get("types") or p.get("filter.type") or "urn:entity:artist").split(",") if t]
    take = min(int(p.get("take") or 5) if (p.get("take") or "5").isdigit() else 5, 20)
    if not q:
        return {"results": []}
    nq = norm(q)
    cands = {}
    for slot in ["/search"] + [f"/v2/insights|{t}|" for t in types]:
        for e in store.pool(slot, 40):
            if (set(e.get("types") or []) | {e.get("subtype")}) & set(types):
                cands.setdefault(e["entity_id"], e)
    for e in (registry().values() if os.environ.get("MOCK_INVENT_ACTS") == "1" else []):
        if set(e.get("types") or []) & set(types):
            cands.setdefault(e["entity_id"], e)
    exact = [e for e in cands.values() if norm(e["name"]) == nq]
    prefix = sorted((e for e in cands.values() if nq in norm(e["name"]) and e not in exact), key=lambda e: -(e.get("popularity") or 0))
    # Like the real API, a name nobody has heard of gets only loose matches (the app then asks
    # "who do you sound like?"). MOCK_INVENT_ACTS=1 makes one up instead.
    first = exact or ([made_up(q, types[0])] if os.environ.get("MOCK_INVENT_ACTS") == "1" else [])
    fuzzy = sorted(cands.values(), key=lambda e: unit(f"{nq}|{e['entity_id']}"))
    out, seen = [], set()
    for e in first + prefix + fuzzy:
        if e["entity_id"] not in seen:
            seen.add(e["entity_id"])
            out.append(e if e.get("types") else {**e, "types": [e.get("subtype") or types[0]]})
    return {"results": out[:take]}


def by_id(i: str):
    return registry().get(i) or store.entity_by_id(i)


def entities(p: dict):
    ids = [i for i in p.get("entity_ids", "").split(",") if i]
    return {"results": [e for e in (by_id(i) for i in ids) if e]}


def tags(p: dict):
    q = (p.get("filter.query") or "").strip()
    take = int(p.get("take") or 10) if (p.get("take") or "10").isdigit() else 10
    words = [w for w in norm(q).split() if len(w) > 2]
    pool = all_tags()
    hits = [t for t in pool if any(w in norm(t["name"]) for w in words)]
    out = [{"id": t["id"], "name": t["name"], "tags": [], "type": t["type"], "parents": [{"type": "urn:entity:artist"}],
            "popularity": rnd(0.9 + 0.1 * unit(t["id"]), 8), "properties": {}} for t in hits]
    if q and not any(norm(t["name"]) == norm(q) for t in out):
        tid = f"urn:tag:genre:music:{slug(q)}"
        out.insert(0, {"id": tid, "name": q[:1].upper() + q[1:], "tags": [], "type": "urn:tag:genre:music",
                       "parents": [{"type": "urn:entity:artist"}, {"type": "urn:entity:album"}], "popularity": rnd(0.95 + 0.05 * unit(q), 8), "properties": {}})
    return {"results": {"tags": out[:take]}, "success": True}


def trending(p: dict):
    seed = json.dumps(p, sort_keys=True)
    pts = [{"date": f"2026-{8 + i // 4:02d}-{1 + (i % 4) * 7:02d}", "population_percentile": rnd(unit(f"{seed}|{i}"), 4),
            "population_rank": 1 + h(f"{seed}|r{i}") % 5000, "population_rank_velocity": rnd(unit(f"{seed}|v{i}") - 0.5, 4)} for i in range(12)]
    return {"results": {"trending": pts}, "success": True}


def audiences(p: dict):
    seed = json.dumps(p, sort_keys=True)
    names = ["Music Lovers", "Comedy Fans", "Night Owls", "Live Event Goers", "Students", "Young Professionals", "Food Lovers", "Art Enthusiasts"]
    return {"results": {"audiences": [{"id": f"urn:audience:interests:{slug(n)}", "name": n, "entity_id": uid(f"aud:{n}"),
                                       "query": {"affinity": rnd(unit(f"{seed}|{n}"), 4)}} for n in names[:int(p.get("take") or 6) if (p.get("take") or "6").isdigit() else 6]]}, "success": True}


def compare(p: dict):
    return insight_tags(p, int(p.get("take") or 10) if (p.get("take") or "10").isdigit() else 10)


ROUTES = {"/search": search, "/v2/insights": insights, "/v2/insights/": insights, "/v2/tags": tags, "/v2/trending": trending,
          "/entities": entities, "/v2/audiences": audiences, "/v2/analysis/compare": compare}
