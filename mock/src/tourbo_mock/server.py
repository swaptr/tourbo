"""HTTP front: exact saved answer → near saved answer → synthetic. Never 429 unless asked."""

import json
import os
import random
import sys
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from . import keys, store, synth

STATS: Counter = Counter()
_stats_lock = threading.Lock()
FAIL_STATUS = int(os.environ.get("MOCK_FAIL_STATUS") or 0)  # e.g. 500: fail requests on purpose
FAIL_RATE = float(os.environ.get("MOCK_FAIL_RATE") or (1 if FAIL_STATUS else 0))


def answer(path: str, pairs):
    """(status, body, source)."""
    p = dict(pairs)
    key = keys.cache_key(path, pairs)
    r = store.exact(key)
    if r is not None:
        return 200, r, "cache"
    take = int(p["take"]) if p.get("take", "").isdigit() else None
    r, how = store.near(path, pairs, take, synth.h(key))
    if r is not None:
        return 200, trim(r, take, p), f"near;{how}"
    fn = synth.ROUTES.get(path)
    if not fn:
        return 404, {"error": {"reason": "not found", "message": f"mock has no {path}"}}, "none"
    return 200, fn(p), "synthetic"


def trim(r, take, p):
    """Slice a near answer's list to the requested take and drop excluded ids."""
    res = r.get("results") if isinstance(r, dict) else None
    exclude = set(filter(None, p.get("filter.exclude.entities", "").split(",")))
    def cut(xs):
        xs = [x for x in xs if not (isinstance(x, dict) and x.get("entity_id") in exclude)]
        return xs[:take] if take else xs
    if isinstance(res, list):
        return {**r, "results": cut(res)}
    if isinstance(res, dict):
        return {**r, "results": {k: (cut(v) if isinstance(v, list) and k != "heatmap" else v) for k, v in res.items()}}
    return r


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "tourbo-mock"

    def log_message(self, fmt, *args):
        if os.environ.get("MOCK_LOG") == "1":
            sys.stderr.write("%s\n" % (fmt % args))

    def send(self, status, body, source, extra=None):
        data = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Mock-Source", source.split(";")[0])
        if ";" in source:
            self.send_header("X-Mock-Near", source.split(";")[1])
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        t0 = time.time()
        s = urlsplit(self.path)
        if s.path == "/__mock/stats":
            return self.send(200, {"index": store.INDEX.size, "sources": dict(STATS)}, "none")
        if s.path in ("/healthz", "/__mock/health"):
            return self.send(200, {"ok": True, "index": store.INDEX.size}, "none")
        pairs = [(k, v) for k, v in keys.parse(s.query) if k != "__fail"]
        fail = dict(keys.parse(s.query)).get("__fail")
        if fail or (FAIL_RATE and random.random() < FAIL_RATE):
            status = int(fail) if fail and fail.isdigit() else (FAIL_STATUS or 500)
            return self.send(status, {"error": {"reason": "mock failure", "message": f"failing on purpose ({status})"}}, "fail")
        if not self.headers.get("X-Api-Key"):
            return self.send(401, {"error": {"reason": "missing key", "message": "X-Api-Key header required"}}, "none")
        try:
            status, body, source = answer(s.path, pairs)
        except Exception as e:  # never a 429; a broken generator is a 500 the app already handles
            status, body, source = 500, {"error": {"reason": "mock failed", "message": str(e)}}, "error"
        with _stats_lock:
            STATS[source.split(";")[0]] += 1
        self.send(status, body, source)
        if os.environ.get("MOCK_LOG") != "0":
            sys.stderr.write(f"{source.split(';')[0]:9} {status} {int((time.time() - t0) * 1000):4}ms {s.path}?{s.query[:120]}\n")


def serve(host: str, port: int):
    store.INDEX.load(lambda m: print(m, flush=True))
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    print(f"tourbo-mock on http://{host}:{port}  (set QLOO_BASE_URL to this)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print(f"sources: {dict(STATS)}", flush=True)
