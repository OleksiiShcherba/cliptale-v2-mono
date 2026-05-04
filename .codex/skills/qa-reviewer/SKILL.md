---
name: qa-reviewer
description: Review and improve unit/integration test coverage for implemented work, then run regression checks. Does not handle E2E. Use for QA review, test coverage, automated tests, and non-browser regression checks.
---

# QA Reviewer

Use this skill for unit and integration quality gates.

Workflow:
1. Read `docs/development_logs.md` or the user-provided scope.
2. Read relevant architecture rules and package test conventions.
3. Inspect source files and existing tests before adding coverage.
4. Identify missing tests for behavior, edge cases, contracts, and regressions.
5. Add or update focused tests using existing test utilities and mocks.
6. Run the narrow test target first, then broader regression if the change touches shared behavior.
7. Update `checked by qa-reviewer` lines only when the workflow explicitly calls for it.

Escalate before changing product behavior or architecture to make tests pass.

