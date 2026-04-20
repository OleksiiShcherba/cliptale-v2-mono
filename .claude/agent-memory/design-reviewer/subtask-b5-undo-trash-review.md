---
name: Subtask B5 Undo Toast + Trash Panel Design Review
description: Design review completed 2026-04-20; found 4 violations across 3 files (kindBadge padding, ProjectCard delete color+padding, StoryboardCard delete color+padding+weight)
type: project
---

## Reviewed Subtask
**EPIC B Backlog Batch — Subtask B5: FE Undo toast + Trash panel** (2026-04-20)

## Design Review Result
⚠️ **COMMENTED** — `checked by design-reviewer - COMMENTED`

4 design-guide violations found; code review required before approval.

## Violations Found

### 1. TrashPanel kindBadge Spacing Violation
- **File:** `apps/web-editor/src/features/trash/trashPanel.styles.ts`, line ~89
- **Issue:** Padding `'2px 6px'` violates 4px grid system (design-guide §2 Spacing)
- **Fix:** Change to `'4px 4px'` or `'4px 8px'` (space-1 + space-1 or space-1 + space-2)
- **Severity:** Medium — badge sizing misalignment

### 2. ProjectCard Delete Button Color & Padding Violations
- **File:** `apps/web-editor/src/features/home/components/ProjectCard.tsx`, lines ~174–176
- **Issue 1:** Hardcoded `color: '#EF4444'` instead of `error` token (design-guide §3)
- **Issue 2:** Padding `'4px 10px'` not 4px-grid-aligned; should be `'4px 12px'` (space-1 + space-3)
- **Fix:** 
  1. Add `const ERROR = '#EF4444'` at line 14 with other token definitions
  2. Change button color to `ERROR`
  3. Change padding to `'4px 12px'`
- **Severity:** Medium — token usage convention + grid alignment

### 3. StoryboardCard Delete Button Color, Padding & Typography Violations
- **File:** `apps/web-editor/src/features/home/components/StoryboardCard.tsx`, lines ~270–282
- **Issue 1:** Hardcoded `color: '#EF4444'` instead of `error` token (design-guide §3)
- **Issue 2:** Padding `'4px 10px'` not 4px-grid-aligned; should be `'4px 12px'`
- **Issue 3:** `fontWeight: 400` does not match `label` spec (requires 500 per design-guide §3 Typography table)
- **Fix:**
  1. Add `const ERROR = '#EF4444'` at line 14 with other token definitions
  2. Change button color to `ERROR`
  3. Change padding to `'4px 12px'`
  4. Change Delete button `fontWeight` from 400 to 500
- **Severity:** Medium — token + grid + typography spec mismatch

## Passed Components

✅ **UndoToast** (undoToast.styles.ts, UndoToast.tsx)
- All colors use design tokens (surface-elevated, text-primary, primary, border, text-secondary)
- Typography: label (14px/400) and caption (12px/500) properly matched
- Spacing: all values 4px-grid-aligned (padding 12px/16px, gaps 16px)
- Border radius: 8px (modal) and 4px (buttons) ✓
- Accessibility: role="status", aria-live="polite", aria-labels on buttons ✓

✅ **TrashPanel Layout** (except kindBadge)
- Top bar, content, list row, item styles all properly spaced and colored
- Page title: heading-2 (20px/600) ✓
- Item name: body (14px/400) ✓
- Timestamp: body-sm (12px/400) ✓
- Restore button: label (12px/500) ✓
- Accessibility: role="list", role="listitem", role="alert", aria-labels ✓

✅ **ProjectCard Resume Button**
- Uses token colors, proper spacing, correct typography

✅ **StoryboardCard Resume Button**
- Uses `PRIMARY` and `PRIMARY_DARK` tokens with hover transitions ✓
- Typography: label (12px/500) ✓
- Padding: 8px/12px (space-2/space-3) ✓
- Border radius: 8px (radius-md) ✓

## Design Guide References
- **§2 Spacing:** 4px base unit; tokens space-1 through space-16
- **§3 Typography:** label token = 12px, 500 Medium, 16px line-height
- **§3 Colors:** error = #EF4444; all colors should use token constants
- **§3 Border Radius:** radius-sm = 4px, radius-md = 8px

## Notes
- UndoToast is a high-quality implementation with no violations
- TrashPanel structure and accessibility are solid; only kindBadge padding needs fixing
- Delete buttons on ProjectCard and StoryboardCard follow the same pattern but have separate violations in each (ProjectCard color+padding, StoryboardCard color+padding+weight)
- Resume button styling on StoryboardCard is correct and can serve as a pattern reference
- No Stitch/Figma updates needed — design-guide tokens are authoritative
