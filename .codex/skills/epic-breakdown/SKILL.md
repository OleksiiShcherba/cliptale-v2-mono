---
name: epic-breakdown
description: Break a feature, epic, PRD, or product requirement into developer-ready tickets for the task-planner/task-executor pipeline. Use for "break this down", "create tickets", "turn this into stories", or "plan an epic" requests.
---

# Epic Breakdown

Use this skill to append a structured epic to `docs/general_tasks.md`.

Workflow:
1. Read `docs/general_idea.md`, `docs/general_tasks.md`, `docs/architecture-rules.md`, and `docs/development_logs.md` if present.
2. Inspect relevant code to avoid duplicate or unnecessary tickets.
3. Convert the requirement into lane-grouped tickets: backend, frontend, data, tests, design, migration, or infra as relevant.
4. Each ticket must include goal, scope, acceptance criteria, likely files, dependencies, and validation.
5. Keep tickets small enough for `task-planner` to expand into `docs/active_task.md`.
6. Append to `docs/general_tasks.md` only after preserving existing content.

Do not implement the epic.

