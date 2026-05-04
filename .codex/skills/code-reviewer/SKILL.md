---
name: code-reviewer
description: Review recent code against docs/architecture-rules.md, repository conventions, security, scope, and tests. Use for code review, architecture compliance, recent implementation audit, or "is this code ok" requests.
---

# Code Reviewer

Use this skill in review mode. Findings lead the response.

Workflow:
1. Read `docs/architecture-rules.md`.
2. Read `docs/design-guide.md` for frontend changes.
3. Identify review scope from the user request, `git status`, `git diff`, and `docs/development_logs.md` if present.
4. Inspect changed files and nearby tests.
5. Check for architecture rule violations, security issues, user-facing regressions, missing tests, dead code, overreach, and naming/style drift.
6. Run focused tests or type checks when useful and feasible.
7. Report `APPROVED` only if no blocking findings remain.

Output format:

**Verdict:** APPROVED or CHANGES REQUESTED

**Issues:**
- `file:line` - finding, impact, and violated rule where applicable

**Tests:** commands run and result, or why not run.

