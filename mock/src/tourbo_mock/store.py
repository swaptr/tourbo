"""Saved real responses, read from the app's Postgres at runtime only (never dumped to the repo).

Exact: sha256 key in qloo_cache / cache(namespace='qloo'), newest first.
Near: same path + params minus paging (then sliced to `take`), or, looser, minus the signal ids
(another act's real answer for the same place and type), picked deterministically per request.
"""

import json
import os
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

from . import keys

ROOT = Path(__file__).resolve().parents[2]  # mock/
CACHE_DIR = ROOT / ".cache"
INDEX_FILE = CACHE_DIR / "index.json"
DB_URL = os.environ.get("DATABASE_URL") or "postgresql://tourbo:tourbo@127.0.0.1:5434/tourbo"

_local = threading.local()
_down_until = 0.0


def conn():
    """Per-thread autocommit connection; None while the DB is unreachable (retried every 5 s)."""
    global _down_until
    c = getattr(_local, "conn", None)
    if c is not None and not c.closed:
        return c
    if time.time() < _down_until:
        return None
    try:
        c = psycopg.connect(DB_URL, autocommit=True, connect_timeout=2)
    except psycopg.Error:
        _down_until = time.time() + 5
        return None
    _local.conn = c
    return c


def query(sql: str, args=()):
    c = conn()
    if c is None:
        return []
    try:
        with c.cursor() as cur:
            cur.execute(sql, args)
            return cur.fetchall()
    except psycopg.Error:
        try:
            c.close()
        except Exception:
            pass
        _local.conn = None
        return []


def exact(key: str):
    rows = query(
        """select response, fetched_at from qloo_cache where key = %s and response is not null
           union all
           select value, stored_at from cache where namespace = 'qloo' and key = %s and value is not null
           order by 2 desc limit 1""",
        (key, key),
    )
    return rows[0][0] if rows else None


def many(keys_: list[str]):
    if not keys_:
        return {}
    rows = query("select key, response from qloo_cache where key = any(%s) and response is not null", (keys_,))
    return {k: r for k, r in rows}


# ---------- index (urls only, no jsonb) ----------
class Index:
    def __init__(self):
        self.near: dict[str, list] = {}  # signature -> [[key, take], ...]
        self.loose: dict[str, list] = {}  # loose signature -> [key, ...] (non-empty answers)
        self.by_type: dict[str, list] = {}  # "path|filter.type|filter.tags" -> [key, ...]
        self.size = 0

    def load(self, log=print):
        t0 = time.time()
        stamp = query("select count(*), coalesce(max(fetched_at)::text, '') from qloo_cache")
        stamp = list(stamp[0]) if stamp else None
        if stamp and INDEX_FILE.exists():
            try:
                data = json.loads(INDEX_FILE.read_text())
                if data.get("stamp") == stamp:
                    self.near, self.loose, self.by_type = data["near"], data["loose"], data["by_type"]
                    self.size = stamp[0]
                    log(f"index: {self.size} saved responses (from {INDEX_FILE.name}, {time.time() - t0:.2f}s)")
                    return
            except (ValueError, KeyError):
                pass
        if not stamp:
            log("index: database unreachable, synthetic answers only")
            return
        # pg_column_size reads the stored size, not the JSON: small = empty result lists.
        rows = query("select key, url, pg_column_size(response) from qloo_cache where response is not null")
        for key, url, size in rows:
            s = urlsplit(url)
            pairs = keys.parse(s.query)
            take = next((int(v) for k, v in pairs if k == "take" and v.isdigit()), 0)
            self.near.setdefault(keys.signature(s.path, pairs), []).append([key, take])
            if size > 500:
                self.loose.setdefault(keys.loose_signature(s.path, pairs), []).append(key)
                p = dict(pairs)
                if s.path != "/v2/insights" or p.get("filter.type", "").startswith("urn:entity"):
                    self.by_type.setdefault(type_slot(s.path, p), []).append(key)
        for v in self.near.values():
            v.sort(key=lambda kt: -kt[1])
        for v in list(self.loose.values()) + list(self.by_type.values()):
            v.sort()
        self.size = len(rows)
        CACHE_DIR.mkdir(exist_ok=True)
        INDEX_FILE.write_text(json.dumps({"stamp": stamp, "near": self.near, "loose": self.loose, "by_type": self.by_type}))
        log(f"index: {self.size} saved responses (scanned urls in {time.time() - t0:.2f}s)")


def type_slot(path: str, p: dict) -> str:
    if path == "/v2/insights":
        tag = p.get("filter.tags", "").split(",")[0] if p.get("filter.type") == "urn:entity:place" else ""
        return f"{path}|{p.get('filter.type', '')}|{tag}"
    return path


INDEX = Index()


def near(path: str, pairs, take: int | None, pick: int):
    """(response, how) from a near-identical saved request, or (None, None)."""
    cands = INDEX.near.get(keys.signature(path, pairs))
    if cands:
        best = next((k for k, t in reversed(cands) if take is not None and t >= take), cands[0][0])
        r = exact(best)
        if r is not None:
            return r, "paging"
    loose = INDEX.loose.get(keys.loose_signature(path, pairs))
    if loose:
        r = exact(loose[pick % len(loose)])
        if r is not None:
            return r, "other-signal"
    return None, None


# ---------- lazy samples for synthetic answers ----------
_pools: dict[str, list] = {}
_lock = threading.Lock()


def pool(slot: str, limit: int = 24) -> list[dict]:
    """Real entities (full objects) from a small sample of saved responses for this slot."""
    with _lock:
        if slot in _pools:
            return _pools[slot]
    ks = INDEX.by_type.get(slot) or []
    step = max(1, len(ks) // limit)
    got = many(ks[::step][:limit])
    seen, out = set(), []
    for k in sorted(got):
        res = got[k].get("results") if isinstance(got[k], dict) else None
        ents = res if isinstance(res, list) else (res or {}).get("entities") or []
        for e in ents:
            if isinstance(e, dict) and e.get("entity_id") and e["entity_id"] not in seen:
                seen.add(e["entity_id"])
                out.append(e)
    with _lock:
        _pools[slot] = out
    return out


def entity_by_id(entity_id: str):
    rows = query(
        "select response from qloo_cache where (url like '/search%%' or url like '/entities%%') and response::text like %s limit 3",
        (f"%{entity_id}%",),
    )
    for (r,) in rows:
        res = r.get("results") if isinstance(r, dict) else None
        ents = res if isinstance(res, list) else (res or {}).get("entities") or []
        for e in ents:
            if isinstance(e, dict) and e.get("entity_id") == entity_id:
                return e
    return None


_cities = None


def cities() -> list[tuple]:
    """(name, ascii_name, admin1, country_code, country_name, lat, lon, population), biggest first."""
    global _cities
    if _cities is None:
        rows = query(
            """select c.name, c.ascii_name, c.admin1, c.country, k.name, c.lat, c.lon, c.population
               from cities c join countries k on k.code = c.country order by c.population desc"""
        )
        if not rows:
            seed = ROOT.parent / "packages/core/src/engine/data/cities.json"
            rows = [(c["name"], c["name"], None, "", "", c["lat"], c["lon"], 0) for c in json.loads(seed.read_text())]
        _cities = rows
    return _cities
