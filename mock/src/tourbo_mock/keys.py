"""Cache keys exactly as packages/core/src/qloo/cache.server.ts cacheKey() builds them:
sha256 of `${pathname}?${URLSearchParams(sorted by key with localeCompare)}`."""

import hashlib
from functools import lru_cache
from urllib.parse import parse_qsl, quote_plus, urlsplit

# Paging-like params: ignored by the near match.
PAGING = {"take", "page", "offset", "size", "limit"}
# Signal ids: ignored by the loose near match (another act's answer for the same place/type).
SIGNALS = {"signal.interests.entities", "signal.interests.tags", "signal.demographics.audiences", "filter.exclude.entities"}


def _ucoll(ch: str) -> int:
    # Primary weights of ICU root collation (what V8 localeCompare uses) for the characters that
    # appear in param names: punctuation before digits before letters, case-insensitive.
    order = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"
    if ch in order:
        return 1 + order.index(ch)
    if ch.isdigit():
        return 100 + ord(ch)
    if ch.isalpha():
        return 1000 + ord(ch.lower())
    return 100000 + ord(ch)


@lru_cache(maxsize=4096)
def locale_key(s: str):
    # Primary: weights; tertiary tie-break: lowercase before uppercase.
    return (tuple(_ucoll(c) for c in s), tuple(c.isupper() for c in s))


def encode(s: str) -> str:
    # application/x-www-form-urlencoded as WHATWG URLSearchParams serializes it.
    return quote_plus(s, safe="*").replace("~", "%7E")


def serialize(pairs) -> str:
    return "&".join(f"{encode(k)}={encode(v)}" for k, v in pairs)


def parse(query: str) -> list[tuple[str, str]]:
    return parse_qsl(query, keep_blank_values=True)


def canonical(path: str, pairs) -> str:
    return f"{path}?{serialize(sorted(pairs, key=lambda kv: locale_key(kv[0])))}"


def cache_key(path: str, pairs) -> str:
    return hashlib.sha256(canonical(path, pairs).encode()).hexdigest()


def key_of_url(url: str) -> str:
    s = urlsplit(url)
    return cache_key(s.path, parse(s.query))


def signature(path: str, pairs, drop=PAGING) -> str:
    return canonical(path, [(k, v) for k, v in pairs if k not in drop])


def loose_signature(path: str, pairs) -> str:
    return signature(path, pairs, PAGING | SIGNALS)
