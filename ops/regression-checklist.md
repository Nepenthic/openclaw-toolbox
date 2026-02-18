# Regression checklist (run after changes)

Date: __________  Change: __________________________

1) Cron → Discord delivery works (isolated job posts to #ai-only or #ops-console)
2) `web_search` burst test (3 queries, spaced 1100–1500ms) does NOT 429
   - Guardrail: any loop over `web_search` should include an explicit delay (>=1100ms) + small-batch paging (avoid 10-result bursts repeatedly)
3) Recovery script runs: `ops\\recover-openclaw.ps1` returns `RESULT: OK` (or alerts correctly)
4) Node tool works: `openclaw nodes status` (or node command via node tool) responds
5) Quarantine redaction works: run `quarantine\redact.ps1` on a sample text and confirm tokens get masked

Notes:
- If any check fails, log it in `ops/progress.md` with the fix and rerun the checklist.
