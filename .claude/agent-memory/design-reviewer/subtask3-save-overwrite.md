---
name: Subtask 3 Save Button + Overwrite Action — Spacing violations
description: Manual save button and conflict-overwrite action in TopBar; 3 spacing/typography violations found
type: project
---

## Subtask 3 Review (2026-04-17)

**Status:** COMMENTED — 3 design-token violations requiring developer fixes

**Location:** 
- `apps/web-editor/src/SaveStatusBadge.tsx` (Overwrite button + root badge)
- `apps/web-editor/src/topBar.styles.ts` (Save button — OK per existing TopBar pattern)

**Violations:**

1. **Overwrite button padding: 2px 8px → should be 4px 8px**
   - Line 149: `padding: '2px 8px'` breaks 4px-grid rule
   - Fix: `padding: '4px 8px'`
   - Severity: High (grid alignment is load-bearing)

2. **Overwrite button typography: 11px 500 (off-scale)**
   - Line 146: `fontSize: '11px', fontWeight: 500`
   - Design-guide §3: caption=11px 400 OR label=12px 500, not 11/500 combo
   - Fix: `fontSize: '12px'` (align with label token)
   - Severity: Med (typography consistency)

3. **SaveStatusBadge root gap: 6px → should be 4px or 8px**
   - Line 132: `gap: '6px'` is not a token
   - Design-guide §3: space-1=4px, space-2=8px only
   - Fix: `gap: '8px'` (matches topBarRight context)
   - Severity: Med (spacing grid consistency)

**Pre-existing (not introduced by this subtask):**
- TopBar buttons use `borderRadius: 6px` (hardcoded, not a token). Design-guide §3 has radius-sm=4px, radius-md=8px. This was approved in Subtask 1 (Home Button). Flag for separate refinement if needed.

**Why:** ClipTale design system enforces 4px base spacing unit and defined typography scale per design-guide §3. Off-scale values create visual/alignment inconsistency.
