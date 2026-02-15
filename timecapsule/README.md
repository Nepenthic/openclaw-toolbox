# Time Capsule Builds (reconstruction kit)

Goal: if Windows/OpenClaw gets nuked, you can rebuild fast **without** relying on vague memory.

This is **not** a disk image. It’s a reproducible recipe + evidence.

## What’s included
- `snapshot.ps1` → collects: OS info, GPU/driver info, PATH, OpenClaw versions, Scheduled Task definitions (best-effort), and basic installed-app inventory.
- `verify.ps1` → quick checks: gateway listener, node connectivity, PATH sanity flags.
- `snapshots/` → outputs (timestamped)

## Run
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\timecapsule\snapshot.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\timecapsule\verify.ps1
```

## Privacy
The snapshot avoids secrets, but it can include machine paths + app lists. Don’t post it publicly unredacted.
Use `workspace\quarantine\scan.ps1` before sharing.
