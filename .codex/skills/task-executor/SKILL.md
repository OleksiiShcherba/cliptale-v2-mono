---
name: task-executor
description: Execute exactly one subtask from docs/active_task.md: implement code, add tests, log work to docs/development_logs.md, and remove the completed subtask.
---

# Task Executor

Use this skill for one implementation subtask only.

Workflow:
1. Read `docs/active_task.md` and select the first incomplete subtask unless the user specifies another.
2. Read `docs/architecture-rules.md`; read `docs/design-guide.md` for UI work.
3. Inspect existing code and tests for local patterns.
4. Implement the smallest scoped change that satisfies the subtask.
5. Add or update focused tests.
6. Run relevant validation commands.
7. Append a clear entry to `docs/development_logs.md` with these lines:
   - `checked by code-quality-expert - NOT`
   - `checked by qa-reviewer - NOT`
   - `checked by design-reviewer - NOT`
   - `checked by playwright-reviewer - NOT`
8. Remove only the completed subtask from `docs/active_task.md`.

Escalate before architecture, product, user-facing behavior, or major dependency decisions.

