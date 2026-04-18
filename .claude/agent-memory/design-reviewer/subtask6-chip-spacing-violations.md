---
name: Subtask 6 Chip X-icon spacing/sizing violations
description: Drag-drop asset chips (promptEditorDOM.ts) have 8 design-guide violations: padding 2px 6px (not 4px grid), margins 2px instead of 4px, button size 14×14px (not a token), border-radius 2px (not radius-sm 4px), background opacity hardcoded, font-size 10px (off-scale)
type: project
---

## Design Review Findings — Subtask 6 (2026-04-18)

**Reviewed entry:** Drag-and-drop assets into PromptEditor + X-icon on chips

**Issue count:** 8 violations, all in `promptEditorDOM.ts` and `AssetThumbCard.tsx`

### Issue Summary

| # | Location | Designed/Expected | Implemented | Severity |
|---|----------|--------|-------------|----------|
| 1 | promptEditorDOM.ts:47 | padding: `4px 8px` (space-1/space-2) | `2px 6px` | Med |
| 2 | promptEditorDOM.ts:48 | margin: `0 4px` (space-1) | `0 2px` | Med |
| 3 | promptEditorDOM.ts:77 | margin: `0 0 0 4px` (space-1) | `0 0 0 2px` | Med |
| 4 | promptEditorDOM.ts:78-79 | 16px or 12px (spec needed) | `14×14px` (not a token) | Med |
| 5 | promptEditorDOM.ts:80 | radius-sm: 4px | `2px` (not a token) | Med |
| 6 | promptEditorDOM.ts:82 | Color token at opacity | `rgba(255,255,255,0.25)` hardcoded | Low |
| 7 | promptEditorDOM.ts:84 | 11px (caption) or 12px (label) | `10px` (off-scale) | Med |
| 8 | AssetThumbCard.tsx:71 | Design spec (y-offset for drag image) | `8` (numeric magic number) | Low |

### Root Cause

Chip × button styling was implemented with pixel-perfect values without cross-referencing design-guide §3 spacing/typography tokens. The chip container itself uses `gap: 4px` but internal margins/padding are inconsistent.

### Approved Aspects

✓ Chip color palette (CHIP_COLORS) matches design-guide §3: video=#0EA5E9 (info), image=#F59E0B (warning), audio=#10B981 (success)
✓ Drag affordance (borderColor highlight on hover) correctly uses CHIP_COLORS
✓ Drag image cloning reuses `createChipElement` for visual consistency
✓ DOM event handlers (drag/drop/click) are correctly implemented

### Status

Marked **COMMENTED** in development_logs.md pending developer fixes.
