# openclaw-toolbox

Local-first OpenClaw workspace toolbox for a Windows 11 setup.

What’s in here:
- **Ops + recovery**: gateway/node health checks, self-heal scripts
- **Remote hands**: media/volume/window/app control scripts
- **Safety utilities**: prompt/log quarantine + redaction workflow
- **Time capsule**: snapshot/verify scripts for capturing system baselines
- **Switchboard**: lightweight local job router + workers

## Important: what is *not* included
This repo intentionally does **not** contain secrets or private state, including:
- `~/.openclaw/openclaw.json` (Discord token, gateway token)
- `~/.openclaw/exec-approvals.json` (tokens)
- `~/.openclaw/memory/*.sqlite` (databases)
- `~/.openclaw/agents/**/sessions/*.jsonl` (transcripts)
- `.env` / `*.env` (API keys)
- workspace logs and large snapshot outputs

## Quick start
Most scripts are PowerShell.

```powershell
# From the workspace root
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\openclaw-doctor-lite.ps1
```

## Layout
- `ops/` — health checks + logging helpers
- `controls/` — remote control pack wrappers
- `quarantine/` — redaction and scanning workflow
- `timecapsule/` — snapshot tooling
- `switchboard/` — multi-machine job routing utilities
- `chaosmonkey/` — observe-first stability harness

