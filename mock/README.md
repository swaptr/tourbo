# tourbo-mock: local fan-data mock (dev only)

A small Python server that answers the fan-data endpoints the app calls (`/search`, `/v2/insights`,
`/v2/tags`, `/v2/trending`, `/entities`, `/v2/audiences`, `/v2/analysis/compare`) when the real
API key is out of quota. **Production does not use it**: the deployed app runs with the real
`QLOO_API_KEY` and `QLOO_BASE_URL`. This directory is docker-ignored in tourbo (kept in git as a dev tool); nothing in
the app references it.

## Run

Needs [uv](https://docs.astral.sh/uv/) and the app's Postgres (the embedded one on 127.0.0.1:5434
starts with `npm run dev`; `DATABASE_URL` overrides). Without a DB every answer is synthetic.

```sh
# from the tourbo repo root
node mock/dev-mock.mjs            # mock on :8790 + `npm run dev` pointed at it (.env untouched)

# or by hand
(cd mock && uv run tourbo-mock --port 8790)
QLOO_BASE_URL=http://127.0.0.1:8790 CACHE_TIERS=memory npm run dev
# a second dev server next to one on :3000 (HMR port clash is only a warning)
PORT=3300 QLOO_BASE_URL=http://127.0.0.1:8790 CACHE_TIERS=memory npm run dev
# engine only
QLOO_BASE_URL=http://127.0.0.1:8790 CACHE_TIERS=memory npm run plan:demo -- "Any Name" na 5
```

Or put `QLOO_BASE_URL=http://127.0.0.1:8790` in `.env` (any non-empty `QLOO_API_KEY` works).
`CACHE_TIERS=memory` keeps mock answers out of the app's Postgres cache of real responses.
Environment variables win over `.env` (Node `--env-file`).

Docker (optional): `docker build -t tourbo-mock mock && docker run --rm --network host -e MOCK_HOST=127.0.0.1 tourbo-mock`
(host networking so it reaches the embedded Postgres on 127.0.0.1:5434; `-e DATABASE_URL=...` for
another DB).

## Where answers come from (`X-Mock-Source` response header, never in the body)

1. `cache`: the exact saved real response. Key = sha256 of `path?sorted params`, same as
   `cacheKey()` in `packages/core/src/qloo/cache.server.ts`; looked up in `qloo_cache` and
   `cache(namespace='qloo')`, newest first.
2. `near`: a saved response for almost the same request. `X-Mock-Near: paging` = same params
   except `take`/paging (sliced to the requested `take`); `other-signal` = same place and type but
   another act's signal (picked deterministically per request), so a new act still gets real
   geography and real venue names.
3. `synthetic`: deterministic answers in the real shapes, seeded by the request: names from a small
   sample of saved real entities, heatmap cells around cities from the app's `cities` table,
   and `/search` answers an unknown name with loose matches only, like the real API (so the
   app asks "who do you sound like?"); `MOCK_INVENT_ACTS=1` makes it up as an entity with a stable id
   instead (remembered in `.cache/synthetic-entities.json` so `/entities` finds it again).

Saved responses are read from the DB at runtime only; nothing is dumped into the repo. `.cache/`
(URL index, rebuilt when `qloo_cache` changes) is git-ignored.

## Knobs

- `GET /__mock/stats`: answers per source. `GET /healthz`.
- `?__fail=503` on any request, or `MOCK_FAIL_STATUS=500 MOCK_FAIL_RATE=0.2`: fail on purpose.
  The mock never returns 429 on its own.
- `MOCK_LOG=0` quiet, `MOCK_HOST`, `MOCK_PORT`.
- Tests: `cd mock && uv run python -m unittest discover -s tests` (cache keys recomputed from 20 random saved URLs, encoding, sort order).
