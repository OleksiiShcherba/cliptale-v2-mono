---
name: playwright-reviewer
description: Run Playwright E2E and visual review for implemented UI features, using screenshots and real user workflows. Use for UI testing, visual regression, E2E checks, and updating playwright reviewer status in development logs.
---

# Playwright Reviewer

Use this skill for browser-based validation.

Workflow:
1. Read `docs/development_logs.md` and identify relevant unchecked or requested UI entries.
2. Read known workflows from `.claude/agent-memory/playwright-reviewer/` if present.
3. Verify the expected app URL is reachable before writing tests.
4. Use existing project Playwright patterns; avoid ad hoc selectors when stable test ids or roles exist.
5. Exercise real workflows: navigate, enter data, click, drag, upload, wait for visible outcomes.
6. Capture screenshots at meaningful before/after points.
7. Inspect screenshots and console/network failures.
8. Update only the `checked by playwright-reviewer` line when the user asked for log updates.

Default project assumptions:
- Web editor commonly runs at `http://localhost:5173`.
- API commonly runs at `http://localhost:3001`.
- Docker Compose is the expected environment; do not start or stop services unless asked.

