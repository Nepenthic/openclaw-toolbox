# Ops Progress Log

A short, durable artifact for long-running work.

## 2026-02-17
- Cron delivery fixed: moved notification cron jobs to `sessionTarget: isolated` with explicit Discord sends.
- AI self-improvement digest added (daily 09:00 CST → #ai-only).
- Brave key hygiene: prefer `.openclaw/.env` as source of truth; avoid storing keys in `openclaw.json`.

### Next
- Add/maintain a small regression checklist after any config/tooling change.
- Tighten digest throttling: 1–2 second delay between Brave searches.
