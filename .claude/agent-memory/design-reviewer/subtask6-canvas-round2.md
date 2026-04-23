---
name: Subtask 6 Canvas round 2 & 3 — All fixes verified APPROVED
description: Subtask 6 final design review (2026-04-22) after fix rounds 1–2; all spacing/color/token violations resolved; verified GhostDragPortal padding 8/8, ERROR token, BORDER usage
type: project
---

**Subtask 6: Canvas: edges + ghost drag + auto-insert + Add Block**

## Final Review (2026-04-22, post-fix-round-2)

### All Fixes Verified ✓

**Fix Round 1 (code-reviewer):**
- useStoryboardDrag.ts:219 — replaced hardcoded `#252535` with BORDER token ✓
- StoryboardPage.tsx:117 — replaced hardcoded `#252535` with BORDER token ✓
- StoryboardCanvas.tsx:45 — replaced hardcoded `#1E1E2E` with SURFACE_ELEVATED token ✓
- storyboardPageStyles.ts lines 247, 263 — gap `6px` → `4px` (space-1) ✓

**Fix Round 2 (design-reviewer + code-reviewer):**
- storyboardPageStyles.ts:19–21 — added ERROR token `#EF4444` to exports ✓
- StoryboardPage.tsx:217 — replaced hardcoded `'#EF4444'` with ERROR token ✓
- GhostDragPortal.tsx:43, 56 — CLONE_HEADER_STYLE & CLONE_BODY_STYLE padding `'8px 12px'` → `'8px 8px'` (symmetric, space-2 all sides) ✓

### Comprehensive Spacing Verification

All padding/margin/gap values verified on 4px grid per design-guide §3:

| Component | Property | Value | Token | Status |
|-----------|----------|-------|-------|--------|
| canvasToolbar | gap | 8px | space-2 | ✓ |
| canvasToolbarButton | gap | 4px | space-1 | ✓ |
| canvasToolbarButton | padding | 0 16px | space-4 | ✓ |
| canvasToolbarButton | height | 36px | — | ✓ |
| canvasToolbarButtonDisabled | gap | 4px | space-1 | ✓ |
| canvasToolbarButtonDisabled | padding | 0 16px | space-4 | ✓ |
| CLONE_HEADER_STYLE | padding | 8px 8px | space-2 | ✓ |
| CLONE_BODY_STYLE | padding | 8px 8px | space-2 | ✓ |
| ghostClone | (position) | fixed, -50% translate | — | ✓ |
| CONTROLS_STYLE | borderRadius | 8px | radius-md | ✓ |

### Color Token Verification

All colors use design-guide tokens (§3):
- SURFACE: `#0D0D14` ✓
- SURFACE_ELEVATED: `#1E1E2E` ✓
- BORDER: `#252535` ✓
- TEXT_PRIMARY: `#F0F0FA` ✓
- TEXT_SECONDARY: `#8A8AA0` ✓
- PRIMARY: `#7C3AED` ✓
- ERROR: `#EF4444` ✓

### Summary

✅ **All 3 fix rounds completed and verified**
✅ **Zero hardcoded colors remaining** (all use design tokens)
✅ **All spacing values on 4px grid**
✅ **All component structure correct**

**Status:** APPROVED — ready for production
