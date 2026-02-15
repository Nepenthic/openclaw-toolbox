# Prompt-Quarantine (local-first)

Goal: reduce accidental secret leaks + prompt-injection exposure **before** text is sent to an LLM.

This is intentionally **not** wired into Discord/OpenClaw automatically yet (that would require a dedicated channel plugin / proxy). Instead, it gives you:
- a redaction tool you can run locally
- a simple “quarantine workflow” you can use when pasting logs/config

## What it does
- Detects and redacts common secret patterns (tokens, API keys, auth headers)
- Flags likely prompt-injection phrases ("ignore previous instructions", "system prompt", etc.)
- Highlights high-risk payloads (commands that delete files, download/execute, etc.)

## Usage
### Redact a file
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\quarantine\redact.ps1 -InFile C:\path\to\log.txt -OutFile C:\path\to\log.redacted.txt
```

### Redact text from clipboard (writes back to clipboard)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\quarantine\redact-clipboard.ps1
```

### Scan only (no changes)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\quarantine\scan.ps1 -InFile C:\path\to\whatever.txt
```

## Next step (optional)
If you want this to be automatic, we can build a dedicated OpenClaw channel plugin (Discord relay/proxy) that quarantines inbound/outbound content. That’s a bigger change and I won’t do it without you explicitly opting in.
