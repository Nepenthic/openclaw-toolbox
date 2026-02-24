# OpenClaw Control Center (ClawForge MVP)

Local LAN control panel + file-backed job queue.

## Run

```powershell
cd control-center
npm start
```

Default bind: `0.0.0.0:3080`

## State directory

By default, Control Center stores state under:

- `%USERPROFILE%\.openclaw\control-center\`

Override with:

- `OPENCLAW_CONTROL_CENTER_STATE_DIR` (absolute or relative path)

### Files

- `secrets.json` – first-run admin password + cookie secret
- `audit.log` – append-only JSONL audit log (rotates when too large)
- `jobs/` – file-backed queue (`pending/`, `processing/`, `done/`, `failed/`)

## LAN allowlist (important)

The API enforces a host/origin allowlist.

- `CONTROL_CENTER_ALLOWED_HOSTS` – comma-separated hostnames/IPs (no port)
  - If not set, localhost only (`localhost,127.0.0.1,::1`).

## Worker

The background worker drains pending jobs automatically.

- `CONTROL_CENTER_WORKER_ENABLED` – set to `0` to disable (default: enabled)
- `CONTROL_CENTER_WORKER_POLL_MS` – poll interval (default: 1500)
- `CONTROL_CENTER_WORKER_DRAIN_PER_TICK` – max jobs per tick (default: 10)

## Audit log

- `CONTROL_CENTER_AUDIT_MAX_BYTES` – rotate `audit.log` when it exceeds this size (default: 10MB)

## Node execution (optional)

If a Gateway token is configured, certain jobs can be executed via `nodes.run` on a paired node.

- `OPENCLAW_GATEWAY_URL` – e.g. `http://127.0.0.1:18789`
- `OPENCLAW_GATEWAY_TOKEN` – **do not commit**
- `CONTROL_CENTER_NODES_RUN_PATH` – nodes.run path (default: `/v1/nodes/run`)
- `CONTROL_CENTER_DEFAULT_NODE_ID` – preferred node id for new jobs (e.g. `K15`)
