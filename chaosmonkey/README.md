# Chaos Monkey for Windows (safe edition)

This is a **controlled stability harness**, not actual chaos.

Principles:
- **Observe-first**: collect health metrics without perturbing the system.
- **Single stressor at a time**, short duration, capped.
- **Hard stop conditions**: if we detect signs of instability, we stop and report.
- No elevation required.

## Modes
- `observe` (default): gather a stability report.
- `microstress`: run tiny, bounded stress tests (CPU/disk/network) and compare before/after.

## Run
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\chaosmonkey\run.ps1 -Mode observe
powershell -NoProfile -ExecutionPolicy Bypass -File .\chaosmonkey\run.ps1 -Mode microstress
```

## Output
Writes a timestamped report under `chaosmonkey\reports\`.

## Notes
- This currently runs on the MSI machine (where we have control). It does not touch the K15 until we have a node/agent there.
