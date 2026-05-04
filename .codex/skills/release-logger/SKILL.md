---
name: release-logger
description: Compact development logs while preserving one uncompacted backup. Use for processing dev logs, release summaries, log compaction, or preparing logs for release.
---

# Release Logger

Use this skill to compact `docs/development_logs.md` or `docs/development-logs.md`.

Workflow:
1. Resolve the dev log path:
   - Prefer `docs/development_logs.md` if present.
   - Otherwise use `docs/development-logs.md`.
   - Stop if neither exists.
2. Copy the full current log into `docs/lust-not-compacted-dev-logs.md`, overwriting the previous backup.
3. Rewrite the dev log into a compact summary grouped by feature/component.
4. Keep files touched, bug fixes, features, dependency changes, architecture decisions, TODOs, and reviewer statuses.
5. Remove filler, duplicate reasoning, timestamps, and session chatter.
6. Report original and new line counts.

Do not discard meaningful audit facts during compaction.

