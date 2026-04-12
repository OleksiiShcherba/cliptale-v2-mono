---
name: C9 Caption Color Token Violation — RESOLVED
description: Design-guide specifies Caption=success(#10B981); previously implemented as Caption=warning(#F59E0B); now FIXED and APPROVED
type: project
---

## Issue Summary

**Subtask:** C9 — Timeline rendering: add caption entry to `ClipBlock`

**Date:** 2026-04-12

**Status:** ✅ APPROVED — High severity violation fixed and verified by design-reviewer on 2026-04-12

---

## The Violation

**Design Guide Authority (line 285):**
> Timeline tracks use distinct colors: Video=`primary`, Audio=`primary-light`, Caption=`success`, Overlay=`warning`

**Color Token Definitions (Section 3):**
- `success` = `#10B981` — for "Asset ready status, confirmations"
- `warning` = `#F59E0B` — for "Overlay track clips, alerts"

**Implementation (ClipBlock.tsx):**
```typescript
const CLIP_COLORS: Record<Clip['type'], string> = {
  video:          '#7C3AED',        // primary ✓
  audio:          '#4C1D95',        // primary-light ✓
  'text-overlay': '#10B981',        // success ✓
  image:          '#0EA5E9',        // info ✓
  caption:        '#F59E0B',        // WRONG — should be success (#10B981)
};
```

**Result:** Caption clips render with warning (amber) instead of success (green).

---

## Root Cause

The development notes claimed:
> `#F59E0B` maps to the design-guide `warning` token — it does not collide with green (`#10B981`, text-overlay) or blue (`#0EA5E9`, image) or purple (`#7C3AED`, video)

This reasoning conflates "not colliding" (which is true) with "correct token mapping" (which is false). The developer picked a visually distinct color but ignored the design-guide's explicit token assignment for captions.

---

## How to Apply

**Fix:** Change line 13 in ClipBlock.tsx from:
```typescript
caption: '#F59E0B',
```

To:
```typescript
caption: '#10B981',
```

This aligns with:
1. Design-guide.md Section 9 Implementation Notes (line 285)
2. Design-guide.md Section 3 color token semantics
3. Maintains visual hierarchy: captions = success (green, semantic for completion), overlays = warning (amber, semantic for alerts)

---

## Notes

- The existing `text-overlay` color at `#10B981` (success) is already correct.
- After the fix, both captions and text-overlays will use the success token — this is acceptable since they serve different UI purposes (caption tracks vs overlay/text tracks on the timeline).
- No design-guide update needed; the authority is clear at line 285.
