---
name: Playwright MCP tools not reliably attached to session
description: Playwright MCP is declared in .mcp.json but mcp__playwright__* tools do not surface in /loop autonomous runs; must verify at run start and block if absent
type: project
---

The project's `.mcp.json` declares a `playwright` MCP server (`npx -y @playwright/mcp@latest --headless=false`), but on scheduled/autonomous `/loop` runs the `mcp__playwright__*` tool family is not attached to the session.

**Recurrences:**
- 2026-04-18 run 1: `ToolSearch` for `playwright`, `browser`, `navigate snapshot click` → no matches.
- 2026-04-19 (00:0X) run 2: `ToolSearch` for `select:mcp__playwright__browser_navigate,...` returned "No matching deferred tools found"; keyword search `browser click snapshot screenshot chromium` returned only Figma/Google Drive auth proxies.

Pattern: two consecutive autonomous runs blocked for the identical reason. The `.mcp.json` declaration is not enough on its own — something about the harness config for autonomous/`/loop` runs is not loading project-level MCP servers. User/plugin MCPs (figma, Google Drive) DO attach, so the issue is specifically with the project-scoped `playwright` entry.

**Why:** Agent spec requires Playwright MCP as the only allowed browser driver (no curl/wget/fetch fallback), so without it the run is blocked by design rather than silently degrading to fake HTTP-only sessions.

**How to apply:**
1. At the very start of each user-simulation run, after preconditions and Docker checks, explicitly confirm that `mcp__playwright__browser_navigate` (or any `mcp__playwright__*` tool) is listed via `ToolSearch select:` or a keyword search. If absent, STOP and report as a blocker — do not attempt curl-based simulation, do not fabricate findings, do not invoke tasks-planner.
2. Leave the Docker stack running; the next run can pick up where this left off.
3. On a human-interactive run, surface to the user that project-scoped MCP servers in `.mcp.json` are not attaching in autonomous runs — may require `~/.claude.json` / settings.json hook work (update-config skill) or harness-level MCP whitelist to fix permanently.
