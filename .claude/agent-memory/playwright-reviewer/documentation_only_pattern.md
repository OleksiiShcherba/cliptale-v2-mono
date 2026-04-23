---
name: Documentation-only testing pattern
description: When docs-only changes (no code, no UI) receive automatic YES pass
type: feedback
---

**Rule:** Documentation-only changes (pure `.md` file updates with zero code or UI surface) receive automatic `YES` pass from playwright-reviewer without any E2E test run.

**Why:** Documentation changes have no runnable code and no visual surface. E2E testing is meaningless for text updates. All reviewers (code-reviewer, qa-reviewer, design-reviewer, playwright-reviewer) treat these as low-risk and pass automatically if other reviewers confirm content quality.

**How to apply:** When the latest log entry shows:
- Only `.md` files changed (no `.ts`, `.tsx`, `.js`, `.css`, `.json`, etc.)
- Other reviewers already marked YES
- Zero code diff / zero UI diff

Mark `checked by playwright-reviewer: YES` with a one-line note: "Documentation-only change (no code, no UI surface). [Brief description]. Zero E2E surface — automatic pass per documentation-only pattern."

**Example verdicts:**
- Architecture guide updates (gotchas, guidelines)
- Design decision documentation
- Dev setup notes
- Code comment/JSDoc updates in docs/*.md files (NOT in .ts)

Do NOT run Playwright if the change is purely documentation.
