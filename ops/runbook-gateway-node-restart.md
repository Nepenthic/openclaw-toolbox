# Runbook: Gateway/Node restart (Windows MSI)

## When to use
- `openclaw nodes status` hangs
- `openclaw node start` hangs
- Cron alerts show node start timed out repeatedly

## Goal
Restore a healthy Gateway + Node with minimal risk.

## Quick checks (safe)
1) Gateway listener:
```bat
netstat -ano | findstr :18789
```
You should see LISTENING on 127.0.0.1:18789.

2) Node connectivity (preferred):
- If CLI is flaky, use node tool checks or the screenshot test.

## Safe restart sequence (manual)
1) Close any stuck OpenClaw CLI terminals.
2) Start Gateway using the launcher:
```bat
C:\Users\Nepen\.openclaw\gateway.cmd
```
Wait until listener is up.
3) Wait for warm-up:
- Give it ~60–240s if the system was unstable.
4) Start Node using the launcher:
```bat
C:\Users\Nepen\.openclaw\node.cmd
```
5) Verify:
- `netstat -ano | findstr :18789`
- Attempt `openclaw nodes status` (if it hangs, prefer node tool diagnostics)

## Preferred automated check
Run:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\Nepen\.openclaw\workspace\recover-openclaw.ps1
```

## Notes
- If the gateway had to be started, a warm-up delay before starting the node can reduce flakiness.
- Keep secrets out of paste/output; use Quarantine if sharing logs.
