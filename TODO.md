# Tourbo — TODO

Open work only (finished items are in git history; ideas in `NICE_TO_HAVE.md`).

## Deploy and submission
- [ ] Render deploy end to end with Postgres on Supabase (owner sets keys; `render.yaml` ready)
- [ ] Render awake Nov 2–5: `.github/workflows/keepalive.yml` pings `/healthz` every 10 min Nov 1–6 once repo variable `TOURBO_URL` is set
- [ ] Repo public (user)
- [ ] Optional (not required by Devpost): ~2 min video (script in `SUBMISSION.md`). Raw silent footage recorded 2026-10-29 (`~/Videos/tourbo-demo-raw.webm`, 2:27, 1440×900, via `scripts/record-demo.cjs`); needs voice-over + trim
- [ ] Resend account: `RESEND_API_KEY`, receiving domain → `OUTREACH_REPLY_DOMAIN`, webhook `/webhooks/email` → `RESEND_WEBHOOK_SECRET` (until then sends are simulated)
- [ ] Publish `@tourbo/mcp`; README Claude Desktop config

## Waiting on fan-data quota (0 left, resets ~Nov 28)
- [ ] Live story tests 1–4, 6, 9, 11, 12, 19–26, 33; probe the 10 new kinds; demographics probe
- [ ] Re-prewarm examples: dance gate (Dance Theatre of Harlem, Pilobolus), thin kinds, stricter room fit

## Quality
- [ ] Perf: desktop 60 fps, 0 long tasks, 3.2 ms main thread; GPU 7.4–8.9 ms (target 8); 4× throttled long tasks
- [ ] Known gaps: India venues include hotel banquet halls (thin venue data); LLM copy occasionally embellishes ("comes home to Capitol Hill")
