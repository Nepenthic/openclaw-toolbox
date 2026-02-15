# Ops helpers

- `openclaw-doctor-lite.ps1` — fast health check that avoids calling the `openclaw` CLI (which can hang in non-interactive runs). Prints gateway listener, env var presence, and scheduled task status.

Usage:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\openclaw-doctor-lite.ps1
```
