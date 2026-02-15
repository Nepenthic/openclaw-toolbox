# Local Model Switchboard (HTTP service)

A small local-first job router. One machine runs the **server** (queue + registry). Any machine (MSI, K15, etc.) can run a **worker** that polls for jobs and executes them (e.g. via `ollama run`).

## Security model (important)
- **Binds to 127.0.0.1 by default** (safe). For LAN access, set `SWITCHBOARD_BIND=0.0.0.0` and use a strong token.
- All requests require `Authorization: Bearer <SWITCHBOARD_TOKEN>`.
- No secrets are stored unless you put them into job payloads.

## Install
No npm deps. Uses Node’s built-in `http`.

## Server
```powershell
$env:SWITCHBOARD_TOKEN = '<set a long random token>'
$env:SWITCHBOARD_BIND = '127.0.0.1'   # or 0.0.0.0 for LAN
$env:SWITCHBOARD_PORT = '3883'
node .\switchboard\server.mjs
```

## Worker
Run on each machine that should execute jobs.

Example (Ollama worker):
```powershell
$env:SWITCHBOARD_TOKEN = '<same token>'
$env:SWITCHBOARD_URL = 'http://<server-ip>:3883'
$env:SWITCHBOARD_WORKER_ID = $env:COMPUTERNAME
$env:SWITCHBOARD_TAGS = 'ollama,windows'
$env:SWITCHBOARD_OLLAMA_MODEL = 'gpt-oss:120b'
node .\switchboard\worker-ollama.mjs
```

## API (minimal)
- `POST /v1/workers/register` { workerId, tags[], meta{} }
- `POST /v1/jobs` { kind, input, requirements? }
- `GET  /v1/jobs/next?workerId=...` -> next runnable job or 204
- `POST /v1/jobs/:id/result` { workerId, ok, output, error }
- `GET  /v1/jobs/:id`

## Quick test (from any machine)
```powershell
$token = $env:SWITCHBOARD_TOKEN
$body = '{"kind":"echo","input":{"text":"hello"}}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3883/v1/jobs -Headers @{Authorization="Bearer $token"} -Body $body -ContentType 'application/json'
```

Then run `node .\switchboard\worker-echo.mjs` to consume it.
