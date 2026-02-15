# Quarantine workflow (recommended)

When you’re about to paste something risky (logs/config/output) into chat:

1) Put it in a file first (or copy it to clipboard)
2) Run scan:
   - `quarantine\scan.ps1 -InFile <file>`
3) If findings include secrets:
   - `quarantine\redact.ps1 -InFile <file> -OutFile <file>.redacted.txt`
4) Paste the redacted version.

For clipboard use:
- Copy the text
- Run `quarantine\redact-clipboard.ps1`
- Paste

## What it *won’t* catch
- all possible secrets
- proprietary tokens with uncommon formats
- data that is sensitive but not token-like (addresses, private conversations)

This is a safety net, not a guarantee.
