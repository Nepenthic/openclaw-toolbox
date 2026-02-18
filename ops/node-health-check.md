# Node health check (MSI)

## Quick signals
- Node tool works: e.g., run a command via nodes.run or take a screenshot.
- Gateway listener is up: `:18789 LISTENING`.

## If node feels "up" but CLI hangs
- Prefer running scripts via node tool (`nodes.run`) rather than `openclaw nodes status`.
- Bound any CLI calls with timeouts (avoid infinite hangs).

## If node is not up
- Start: `C:\Users\Nepen\.openclaw\node.cmd`
- Verify process exists (Task Manager) and then test with a node tool action.
