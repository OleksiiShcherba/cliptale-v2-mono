---
name: feedback-triage
description: Triage client feedback from docs/feedback.md against product plans and development logs. Use to decide what needs fixing now, what is already planned, and what is out of scope, then create docs/active_task.md only for valid fixes.
---

# Feedback Triage

Use this skill before handing client feedback to implementation.

Workflow:
1. Read `docs/feedback.md`.
2. Read `docs/general_idea.md`, `docs/general_tasks.md`, and `docs/development_logs.md`.
3. Split feedback into distinct concerns.
4. Classify each concern:
   - Fix Now: current-iteration feature is genuinely wrong or incomplete.
   - Already Planned: valid concern covered by a future task.
   - Not Applicable: misunderstanding, out of scope, cosmetic-only, or contradicts direction.
5. If no Fix Now items exist, report the triage and do not edit `docs/active_task.md`.
6. If Fix Now items exist, create or update `docs/active_task.md` with only those actionable fixes.

Keep tasks client-readable and developer-ready.

