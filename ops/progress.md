# Ops Progress Log

A short, durable artifact for long-running work.

## 2026-02-18
- Other PC (K15 / NucBox_K15) node-only cutover: gateway bind=lan, token persisted, device paired, Scheduled Task running, `nodes.run` verified.
- Added `ops/find.ps1`: zero-dependency recursive text search (ripgrep-ish) since `rg` isn't available by default in this environment.
  - Why: makes it faster to locate config/docs strings during incident response or tool debugging.
  - Next: if it proves useful, add a short note to regression checklist/runbooks pointing to it.
- Updated `ops/regression-checklist.md` to fix mojibake (UTF-8 punctuation) and add an explicit “Exec safety (Windows/PowerShell)” section.
  - Why: reduces copy/paste footguns during incident response and keeps checklists readable.
  - Next: consider adding `.editorconfig` to enforce UTF-8 + newline norms repo-wide.
- Added `.editorconfig` repo-wide (UTF-8, LF by default; CRLF for PowerShell).
  - Why: prevent mojibake and normalize whitespace/newlines across tools/editors.
- Added `ops/check-encoding.ps1` (non-destructive encoding/line-ending checker) + added it to the regression checklist.
  - Why: catch mixed CRLF/LF, stray CR, and likely-binary/UTF-16 files early (prevents phantom diffs + mojibake).
- Regression checklist: added an explicit encoding/newlines hygiene check (ties to `.editorconfig`).
  - Why: makes “mojibake prevention” a repeatable regression item, not tribal knowledge.
  - Next: if this catches real drift, add a tiny `ops/check-encoding.ps1` verifier.

## 2026-02-17
- Cron delivery fixed: moved notification cron jobs to `sessionTarget: isolated` with explicit Discord sends.
- AI self-improvement digest added (daily 09:00 CST → #ai-only).
- Brave key hygiene: prefer `.openclaw/.env` as source of truth; avoid storing keys in `openclaw.json`.
- Added `ops/recover-openclaw.ps1`: thin wrapper around `openclaw-doctor-lite.ps1` that emits `RESULT: OK|NOT_OK` for easy regression testing.
  - Why: regression checklist referenced a non-existent script; this makes the check real + machine-readable.
  - Next: expand NOT_OK branch to optionally kick scheduled task(s) when safe.

### Next
- Tighten digest throttling: 1-2 second delay between Brave searches.
- (Done) Updated regression checklist with explicit `web_search` pacing guardrail (1100-1500ms) to reduce 429 risk; next: apply the same pacing inside the daily digest job if it currently loops searches without sleeps.
