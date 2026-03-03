# Ops helpers

- `openclaw-doctor-lite.ps1` — fast health check that avoids calling the `openclaw` CLI (which can hang in non-interactive runs). Prints gateway listener, env var presence, and scheduled task status.

Usage:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\openclaw-doctor-lite.ps1
```

## Post-action feedback (ops log + progress)

For quick, append-only “what happened?” notes (useful after running scripts/tools), use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\post-action-feedback.ps1 `
  -Action "<what you did>" -Outcome "<result>" -Details "<optional context>"
```

This appends one line to:
- `ops/progress.md`

And (best-effort) writes an event to:
- `logs/events.log`
