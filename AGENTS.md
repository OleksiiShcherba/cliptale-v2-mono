# Codex Project Operating Rules

This repository also contains Claude-specific automation in `.claude/`. For Codex work, use the adapted local pack in `.codex/`.

## Local Codex Pack

- Agents live in `.codex/agents/`.
- Skills live in `.codex/skills/*/SKILL.md`.
- Claude originals remain the source history, but do not edit `.claude/` unless the user explicitly asks.
- When a task matches a local Codex skill, read that skill first and follow its workflow.
- When a role-specific review or implementation workflow is needed, read the matching `.codex/agents/*.md` file and apply it as the role brief.

## Repository Rules

- Read `docs/architecture-rules.md` before implementation or code review work.
- Read `docs/design-guide.md` for frontend/UI changes.
- Read `docs/general_idea.md` and `docs/general_tasks.md` before planning, triage, or direction checks.
- Treat `docs/development_logs.md` as the implementation audit trail.
- Keep Claude and Codex runtime concepts separate: replace Claude `Agent`, slash-skill, model, and tool-list language with the active Codex tools and permissions.
