---
name: task-orchestrator
description: Drive every subtask in docs/active_task.md through implementation and reviewer gates using the senior-dev and reviewer role briefs. Use for full task-list execution, fix loops, and active_task completion.
---

# Task Orchestrator

Use this skill to coordinate the full task list. The orchestrator coordinates; it does not directly code or review.

Workflow:
1. Read `docs/active_task.md`, `docs/development_logs.md`, and the relevant `.codex/agents/*.md` role briefs.
2. For each subtask, apply the `senior-dev` role and `task-executor` skill to implement exactly one subtask.
3. Run reviewer roles for the new log entry:
   - `code-quality-expert`
   - `qa-engineer`
   - `design-reviewer`
   - `playwright-reviewer`
4. If any reviewer requests changes or marks `COMMENTED`, send the issue back through the executor flow.
5. Continue until all subtasks are complete and all reviewer lines are approved or intentionally commented with user acceptance.
6. When the active task is empty, use `release-logger` if log compaction is requested or part of the project workflow.

In Codex, use available subagent tools only when explicitly authorized by the user/runtime. Otherwise perform the same gates sequentially and keep the user updated.

