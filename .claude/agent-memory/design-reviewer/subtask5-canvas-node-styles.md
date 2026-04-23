---
name: Subtask 5 Canvas Node Styles — Spacing & Token Violations
description: React Flow node components (StartNode/EndNode/SceneBlockNode) have 11 spacing violations (2px, 3px, 6px hardcoded instead of 4px grid) and color tokens hardcoded instead of abstracted
type: project
---

## Subtask 5 — Canvas: React Flow install + node types + port UI

**Reviewed on:** 2026-04-22  
**Status:** COMMENTED — 11 violations requiring fixes

### Spacing Grid Violations (7 issues, priority HIGH)

Design-guide §3 spacing base unit = 4px. Valid values: 4, 8, 12, 16, 20, 24, 32, 48, 64px.

| Component | Location | Current | Issue | Fix |
|-----------|----------|---------|-------|-----|
| header | nodeStyles.ts:93 | padding '8px 10px 6px' | 10px, 6px off-grid | '8px 12px 8px' |
| removeButton | nodeStyles.ts:112 | padding '2px' | 2px off-grid (min = 4px) | '4px' |
| removeButton | nodeStyles.ts:120 | marginLeft '6px' | 6px off-grid | '4px' or '8px' |
| body | nodeStyles.ts:125 | padding '8px 10px' | 10px off-grid | '8px 12px' |
| durationBadge | nodeStyles.ts:148 | padding '2px 6px' | both off-grid | '4px 8px' |
| mediaTypeBadge | nodeStyles.ts:189 | borderRadius '3px' | not a token (valid: 4, 8, 16, 9999) | '4px' (radius-sm) |
| mediaTypeBadge | nodeStyles.ts:190 | padding '1px 4px' | 1px off-grid | '4px 8px' |

### Color Token Abstraction (4 issues, priority LOW)

Hardcoded hex values instead of importing constants from nodeStyles.ts. Values are correct per design-guide §3, but break token-first pattern.

| File | Line(s) | Issue | Value | Token |
|------|---------|-------|-------|-------|
| StartNode.tsx | 20 | border hardcoded | #1E1E2E | SURFACE_ELEVATED |
| EndNode.tsx | 20 | border hardcoded | #1E1E2E | SURFACE_ELEVATED |
| SceneBlockNode.tsx | 37 | color hardcoded | #4C1D95 | PRIMARY_LIGHT (from nodeStyles) |
| SceneBlockNode.tsx | 30, 39 | border hardcoded | #1E1E2E | SURFACE_ELEVATED |

### Verified Color Values (CORRECT)

- Primary: #7C3AED ✓
- Surface: #0D0D14 ✓
- Surface-elevated: #1E1E2E ✓
- Border: #252535 ✓
- Text-primary: #F0F0FA ✓
- Text-secondary: #8A8AA0 ✓
- Error: #EF4444 ✓
- Primary-light: #4C1D95 ✓ (used in SceneBlockNode TARGET_HANDLE)

### Precedent

Similar violations flagged in prior subtasks (C9, C11, E2) — token-first pattern is established across the codebase. These violations are not ambiguous; fixes are straightforward.

### Expected Fix Pattern

```typescript
// nodeStyles.ts — export missing constants
export const SURFACE_ELEVATED = '#1E1E2E';
export const PRIMARY_LIGHT = '#4C1D95';

// In node components, import and use:
import { SURFACE_ELEVATED, PRIMARY_LIGHT } from './nodeStyles';
const HANDLE_STYLE: React.CSSProperties = {
  border: `2px solid ${SURFACE_ELEVATED}`,
};
```
