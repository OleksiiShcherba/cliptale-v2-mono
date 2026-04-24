---
name: Project environment and ports
description: Confirmed ports, stack, and Playwright setup for ClipTale web-editor
type: project
updated: 2026-04-05
---

App URL: http://localhost:5173 (Vite dev server via Docker Compose)
API URL: http://localhost:3001

Playwright version: 1.59.1 (installed at monorepo root node_modules).
Run scripts from monorepo root: `node ./playwright-review-temp.js`
Do NOT use `npx playwright test` from apps/web-editor — it picks up Vitest test files and conflicts with @vitest/expect, throwing "Cannot redefine property: Symbol($$jest-matchers-object)".

No e2e/ directory exists in apps/web-editor. All E2E tests must be written as standalone Node scripts using `const { chromium } = require('@playwright/test')`.

Screenshots dir: create at monorepo root `./playwright-screenshots/`.

**Why:** `npx playwright test` scans all files and conflicts with Vitest matchers in the project.
**Impact:** Always write standalone scripts, never use the Playwright test runner CLI for this project.
