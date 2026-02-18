# Ops Progress Log

A short, durable artifact for long-running work.

## 2026-02-18
- Other PC (K15 / NucBox_K15) node-only cutover: gateway bind=lan, token persisted, device paired, Scheduled Task running, `nodes.run` verified.
- Added `ops/find.ps1`: zero-dependency recursive text search (ripgrep-ish) since `rg` isn’t available by default in this environment.
  - Why: makes it faster to locate config/docs strings during incident response or tool debugging.
  - Next: if it proves useful, add a short note to regression checklist/runbooks pointing to it.

## 2026-02-17
- Cron delivery fixed: moved notification cron jobs to `sessionTarget: isolated` with explicit Discord sends.
- AI self-improvement digest added (daily 09:00 CST → #ai-only).
- Brave key hygiene: prefer `.openclaw/.env` as source of truth; avoid storing keys in `openclaw.json`.
- Added `ops/recover-openclaw.ps1`: thin wrapper around `openclaw-doctor-lite.ps1` that emits `RESULT: OK|NOT_OK` for easy regression testing.
  - Why: regression checklist referenced a non-existent script; this makes the check real + machine-readable.
  - Next: expand NOT_OK branch to optionally kick scheduled task(s) when safe.

### Next
- Tighten digest throttling: 1–2 second delay between Brave searches.
- (Done) Updated regression checklist with explicit `web_search` pacing guardrail (1100–1500ms) to reduce 429 risk; next: apply the same pacing inside the daily digest job if it currently loops searches without sleeps.
