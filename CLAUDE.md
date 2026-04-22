# Claude Code — Project Operating Rules

These rules apply to every Claude Code session opened against this
repository. They are loaded automatically by the harness (via this file
being named `CLAUDE.md` at the project root).

---

## 1. Main session must stay responsive — always Orchestrate-Team

**Rule:** The main interactive session is a *coordinator*, never a
worker. Any non-trivial task — code writing, investigation that takes
more than one or two tool calls, test runs, builds, long shell loops,
Playwright runs, deep file reads — MUST be delegated to a subagent via
the `Agent` tool.

Reference: https://code.claude.com/docs/it/agent-teams (Orchestrate
team pattern).

**Why:** The user reaches this session over Telegram (and other async
channels). If the main session is mid-flight on a long local task, new
messages queue up and the user cannot get a reply. That is not
acceptable. The main session MUST be in a state where it can answer an
incoming message within seconds, at any moment.

**How to apply:**

| Request shape | Main session responsibility | Worker |
|---|---|---|
| "Implement feature X" | Scope the task, spawn senior-dev, return the subagent's summary | `senior-dev` subagent |
| "Run all tests" | Spawn qa-engineer/general-purpose to run the suite in background or foreground, summarise | subagent |
| "Investigate/debug Y" | Spawn Explore or general-purpose subagent | subagent |
| "Fix these bugs (full loop)" | Invoke the `task-orchestrator` skill (it spawns senior-dev + reviewers) | task-orchestrator + subagents |
| One-line clarifying question | Answer inline | — |
| Status check | Read logs/files, answer inline | — |
| Trivial one-file edit the user is watching over | OK inline if it takes one Edit tool call | — |

If a task starts inline and then grows, STOP, spawn a subagent with the
accumulated context, and let the main session return to the prompt.

**Rule of thumb:** If the next step would take the main session offline
for more than ~30 seconds, it belongs in a subagent.

**Background vs foreground:**
- Use `run_in_background: true` on the `Agent` tool when the work is
  independent of the main session's next move, so the user can keep
  messaging while it runs.
- Use foreground when the main session needs the subagent's report
  before it can answer the user.

**Never:**
- Start a 5-minute test run inline and go silent.
- Read a dozen files sequentially in the main session when an Explore
  subagent would do it in parallel.
- Sit in a polling loop in the main session — spawn a subagent or use
  `ScheduleWakeup` / `CronCreate`.

## 2. Main session model — Sonnet only

**Rule:** The interactive main session always runs on Claude Sonnet
(currently `claude-sonnet-4-6`). Enforced by
`.claude/settings.json:"model": "claude-sonnet-4-6"`. Do not override
in-session unless the user explicitly asks for a different model for a
specific session.

Subagents spawned via the `Agent` tool can and often should use a
different model (Opus for heavy architecture work, Haiku for cheap
verification). Override per-agent via the `model` parameter on the
`Agent` tool call when it matters.

## 3. Telegram channel

Per `~/.claude/projects/-home-ubuntu-cliptale-v2-mono/memory/` rules,
every reply to a message that arrived over the Telegram channel goes
out through the `mcp__plugin_telegram_telegram__reply` tool — not the
transcript. Replies are in Ukrainian (technical tokens stay English).

## 4. Branching & deploys

- All changes on a new branch cut from up-to-date `origin/master` —
  never commit directly to `master` unless the user explicitly asks for
  a hotfix straight to master.
- The live deploy at `https://15-236-162-140.nip.io` bind-mounts this
  working tree into the `web-editor` Vite container, so any change to
  `apps/web-editor/src/**` is visible to production clients within
  seconds of HMR picking it up. Keep master the "clients see this"
  branch.
