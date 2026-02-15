# Workspace logs

This folder is for **assistant-owned** logs (safe to inspect, safe to delete/rotate).

- `events.log` — high-level events (config changes, restarts, recoveries).
- `runs/` — per-run logs from helper scripts.

Nothing in here should contain secrets. If a command might output tokens, run it through `quarantine/redact.ps1` before logging.
