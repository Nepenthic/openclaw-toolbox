# Kanban — OpenClaw Ops + Builds

Last updated: 2026-02-17

## Backlog
- Lead pipeline automation redesign (throttled Brave + RSS/non-index sources) and daily drops to `income-leads/DAILY/`.
- Further tighten exec approvals (reduce blast radius; keep usability).
- Re-run `openclaw security audit` and resolve remaining warnings (e.g., trusted proxies, allowlist schema).
- Investigate non-interactive CLI hangs (`openclaw status`, `openclaw nodes status`).
- Build Unity AR puzzle-helper MVP repo skeleton (AR Foundation + CV pipeline stubs).
- Other PC: convert from second gateway to node-only (wipe-by-rename plan).

## Next (Ready)
- Scheduled Tasks: verify existence + correctness of `OpenClaw Gateway` and (re)create/harden `OpenClaw Node` task (targets, battery, restart-on-failure).
- PATH cleanup: snapshot User+Machine PATH, remove corruption, verify Scheduled Tasks inherit.
- Add ops harness versioning to more scripts (gateway PID/listener snapshot, bounded CLI calls).
- Update digest job: enforce polite search spacing and add fetch-only fallback mode when Brave errors.

## Doing
- Cron reliability migration: move “message Mike” jobs to isolated agentTurn + explicit Discord send (DONE, monitor).
- Self-improvement routines:
  - Every 5h self-improvement loop → posts to #ai-only.
  - Daily self-improvement digest → #ai-only.
  - Daily self-improvement books deep-dive → #ai-only.

## Blocked
- Creating/editing Scheduled Tasks programmatically without elevation (`Register-ScheduledTask` / `Set-ScheduledTask`: Access denied). Requires either manual UI changes or elevated run.
- Browser automation reliability (OpenClaw browser control service intermittent).

## Done (recent)
- Discord hardening: allowlist guild/channel/user; snowflakes stored as strings.
- Remote hands control scripts + `controls/` wrappers.
- Recover/health scripts + self-heal policy (single attempt).
- Prompt-Quarantine toolset.
- Timecapsule snapshot tooling.
- Switchboard (job router) + log rotation cron.
- Chaosmonkey observe harness + daily cron.
- GitHub repo created + pushed: https://github.com/Nepenthic/openclaw-toolbox
- Added ops logs + progress + regression checklist; codified untrusted input rule.
- Cron delivery fixed: isolated agentTurn + explicit Discord sends.
- Brave key stabilized; digest runs without 429 after fix.

## Notes / Working Agreements
- Prefer scripts over brittle inline PowerShell.
- No secrets in repo; keep tokens in `.openclaw/.env` or OS env vars.
- Use isolated cron agentTurn when you need a Discord-visible message.
