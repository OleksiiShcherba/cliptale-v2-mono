---
name: development_logs verdict tokens
description: development_logs.md enforces exactly YES or COMMENTED tokens, never OK
type: feedback
---

When marking code reviews in `development_logs.md`, use:
- `checked by code-reviewer - YES` (if compliant, no violations)
- `checked by code-reviewer - COMMENTED` (if issues found, followed by issue lines)

Do not use `OK` even if the system prompt mentions it — the orchestrator rejects `OK` and requires exactly `YES` or `COMMENTED`.

**Why:** The project orchestrator (qa-reviewer, design-reviewer, task-executor downstream) checks for these exact tokens to determine task completion status.

**How to apply:** After completing any code review, update the log entry with `YES` or `COMMENTED`. Always verify the update took effect before issuing final verdict.
