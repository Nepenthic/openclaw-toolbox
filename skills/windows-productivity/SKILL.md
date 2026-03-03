# windows-productivity (OpenClaw skill)

Minimal-risk Windows productivity helpers for the MSI gateway host.

## What this skill does

- **Screenshot**: capture the current *virtual screen* (all monitors) to `media-out/`.
- **Window/app controls**: a small allowlisted set of common actions (minimize all, focus Opera, etc.).
- **Post-action feedback**: append a one-line outcome to `ops/progress.md` and write an event to `logs/events.log`.

## Guardrails

- No arbitrary command execution: actions are **allowlisted** via `ValidateSet`.
- No external network calls.
- File writes are limited to: `media-out/`, `ops/progress.md`, and `logs/events.log`.
- All scripts run locally on the MSI host.

## Commands

### 1) Take a screenshot

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\take-screenshot.ps1
```

Optional output path:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\take-screenshot.ps1 -OutPath .\media-out\my-shot.png
```

### 2) Window/app actions (allowlisted)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\window-action.ps1 -Action MinimizeAll
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\window-action.ps1 -Action FocusOpera
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\window-action.ps1 -Action FullscreenOpera
```

### 3) Post-action feedback (1 line)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\skills\windows-productivity\commands\post-action-feedback.ps1 `
  -Action "screenshot" -Outcome "saved" -Details "captured virtual screen"
```

This appends to `ops/progress.md` and also logs to `logs/events.log`.

## Smoke test

See: `skills/windows-productivity/SMOKE.md`
