---
name: Deferred E2E Areas
description: Features that intentionally have no E2E coverage and why
type: project
---

## E2E for the full editor shell (EPIC 2)

No Playwright/Cypress framework exists in the repo. All EPIC 2 features (PreviewPanel, PlaybackControls, App shell, stores) are covered by unit tests only.

**Why deferred:** E2E framework was not in scope for EPIC 2 according to the dev logs. The architecture-rules.md lists Playwright as the intended E2E tool.

**Impact:** When Playwright is eventually added, priority E2E flows to cover are: (1) video preview plays and scrubs correctly, (2) asset upload → polling → appears in browser panel, (3) two-column layout renders in a real browser.
