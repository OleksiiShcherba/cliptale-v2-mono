---
name: Backend-only subtask review approach
description: Design guide doesn't apply to infrastructure-only changes; rely on playwright for UI regression
type: feedback
---

For media-worker subtasks that have zero frontend changes (no UI components, styling, colors, typography):

**Rule:** Skip design-guide color/spacing/component validation. Instead, rely on the playwright reviewer's UI regression testing to confirm no frontend visual breaks.

**Why:** Design guide enforces UI tokens and component specs — it has no authority over backend job handlers, queue setup, or worker infrastructure. The Figma file represents the visual product, not backend services.

**How to apply:** 
- If subtask touches only `apps/media-worker/` and `apps/api/src/queues/` without web-editor changes, ask playwright for UI regression confirmation first
- Once playwright confirms "zero UI-visible regressions," design-reviewer approval is automatic (no checklist needed)
- Log the approval as: "Backend-only task; design guide does not apply; playwright already confirmed zero regressions"
