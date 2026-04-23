# Active Task — Guardian Recommendations Batch (2026-04-23)

## Context
After the Storyboard Part A regression-fixes batch, the Guardian returned HEALTHY with 5 recommendations (P2–P4) to address as a follow-up batch.

## Subtasks

### Subtask 5 — Commit the full batch to git
**Priority:** P3 — puts 11 subtasks of work into version control

All Storyboard Part A work (8 subtasks) + regression fixes (3 subtasks) are still uncommitted. Create a git commit (or PR branch commit) with all the work.

Steps:
1. `git fetch origin && git checkout -b feat/storyboard-part-a origin/master` (per CLAUDE.md: all changes on new branch from master)
2. Stage all relevant files (exclude playwright-report/ churn and `.claude/agent-memory/` files)
3. Write a commit message summarizing the batch
4. Confirm the commit was created

Note: Do NOT push to remote — just create the local branch + commit.

### Subtask 6 — Document docker compose exec vitest gotcha in architecture-rules.md
**Priority:** P4 — prevents repeated reviewer confusion

Add a note to `docs/architecture-rules.md` (§10 Testing or a new §15 Local Dev Gotchas section) documenting:
- Running `docker compose exec api npx vitest run` from the repo root `/app` hits `@/` alias-resolution errors
- Must run with `-w /app/apps/api` (working directory flag): `docker compose exec -T -w /app/apps/api api npx vitest run`
- Similarly for web-editor: `docker compose exec -T -w /app/apps/web-editor web-editor npx vitest run`
