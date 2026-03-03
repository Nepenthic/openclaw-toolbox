# Smoke test (windows-productivity)

Run from repo root: `C:\Users\Nepen\.openclaw\workspace`

## Screenshot

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\take-screenshot.ps1
```

Expected: prints a path under `media-out\screenshot-YYYYMMDD-HHMMSS.png`.

## Window action (low-risk)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\window-action.ps1 -Action MinimizeAll
```

Expected: `OK: MinimizeAll`

## Post-action feedback

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\post-action-feedback.ps1 -Action "smoke" -Outcome "ok" -Details "windows-productivity"
```

Expected:
- prints the appended line
- `ops/progress.md` has the new entry
- `logs/events.log` has an `INFO` line starting with `feedback:` (best-effort)
