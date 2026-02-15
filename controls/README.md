# OpenClaw PC Control Pack (MSI)

These scripts are designed to be run on the MSI machine (the one running OpenClaw) via OpenClaw `system.run` / `exec`.
They’re intentionally simple wrappers around the working scripts we’ve already used.

## Media
- `controls\playpause.ps1` — toggles Play/Pause (works for most browsers + Spotify)
- `controls\pause.ps1` — alias for play/pause toggle (true “pause-only” isn’t reliably possible via a global hotkey)
- `controls\volume-set.ps1 -Percent 50` — sets system volume to an exact percentage
- `controls\volume-50.ps1` — sets system volume to 50%

## Opera window management
- `controls\opera-to-primary-max.ps1` — move Opera to primary monitor and maximize
- `controls\opera-to-secondary-max.ps1` — move Opera to secondary monitor and maximize
- `controls\opera-focus.ps1` — bring Opera to foreground

## Other
- `controls\minimize-all.ps1` — minimize all windows
- `controls\close-primevideo.ps1` — closes the Prime Video browser window (by title match)
- `controls\close-opera-gx.ps1` — closes visible Opera GX windows (best-effort)

## Notes
- Monitor numbering is based on Windows: primary is DISPLAY1 (usually), secondary is the first non-primary screen.
- If you want true “pause vs play” separation, we can add app-targeted control (Spotify API, or browser automation once proxy is stable).
