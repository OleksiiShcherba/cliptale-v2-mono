---
name: Subtask 5 Projects Panel — Typography Issues Found
description: ProjectCard and CreateButton use 14px 600 weight, which is not in design-guide typography scale
type: feedback
---

## Review Date
2026-04-17

## Issues Found

### Issue 1: ProjectCard Title Typography
- **File:** `apps/web-editor/src/features/home/components/ProjectCard.tsx` (lines 100–113)
- **What's implemented:** `fontSize: 14, fontWeight: 600`
- **Design spec:** Design-guide §3 typography scale has:
  - `body` = 14px 400 Regular
  - `heading-3` = 16px 600 Semi Bold
  - No 14px 600 combination defined
- **Recommendation:** Use `heading-3` (16px 600) or revert to `body` (14px 400)
- **Severity:** Medium — off-scale typography weakens design system fidelity

### Issue 2: CreateButton Text Typography
- **File:** `apps/web-editor/src/features/home/components/ProjectsPanel.tsx` (line 126)
- **What's implemented:** `fontSize: 14, fontWeight: 600`
- **Design spec:** Same violation as Issue 1
- **Note:** Appears in two places in the file (line 126 in CreateButton, implicitly used in PanelHeader call)
- **Recommendation:** Either use `label` (12px 500) for button text or adjust to approved scale
- **Severity:** Medium

## Assessment

All other design tokens verified:
- Colors: All match design-guide §3 (PRIMARY, PRIMARY_DARK, ERROR, SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY)
- Spacing: All use the 4px grid (space-2, space-3, space-4, space-6, space-8)
- Border radius: All use `radius-md` (8px)
- Responsive breakpoints: Correctly implemented (1440px → 3-col, 768px → 2-col, <768px → 1-col)
- Gap: Uses `space-6` (24px) as specified in AC
- Component structure: Matches AC (skeletons, error state, empty state, card grid, create flow)
- Accessibility: ARIA roles, labels, and keyboard handling all present

## Why This Matters
The design guide is explicit that all typography should use the defined scale. A 14px 600 weight creates inconsistency and makes the card titles slightly less visually prominent than intended while being slightly heavier than body text.
