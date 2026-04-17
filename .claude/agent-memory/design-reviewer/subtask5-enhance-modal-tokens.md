---
name: Subtask 5 EnhancePreviewModal spacing token violation
description: Header/footer padding uses hardcoded 20px (not a token); border-radius hardcoded; letter-spacing inconsistent with ExportModal
type: project
---

## Issue Summary

**EnhancePreviewModal** (Subtask 5, reviewed 2026-04-16) has 4 design-guide violations in `enhancePreviewModalStyles.ts`:

### 1. Header/Footer Padding Not Using Tokens (HIGH)

**Current (line 65, 172):**
```typescript
// header
padding: '16px 20px',  // 20px NOT a design-guide token

// footer
padding: '12px 20px',  // same 20px issue
```

**Design-guide §3 spacing tokens** (4px grid):
- space-1: 4px
- space-2: 8px
- space-3: 12px
- space-4: 16px
- space-6: 24px
- space-8: 32px
- space-12: 48px
- space-16: 64px

**Fix:** Change both to `'16px 24px'` and `'12px 24px'` respectively, matching ExportModal.styles.ts pattern (line 45: `paddingLeft: '24px', paddingRight: '16px'`).

### 2. Border Radius Hardcoded (MEDIUM)

**Current (line 50):**
```typescript
borderRadius: '8px',  // hardcoded string
```

**Design-guide §3 border radius tokens:**
- radius-sm: 4px
- radius-md: 8px
- radius-lg: 16px
- radius-full: 9999px

**Fix:** Extract `export const RADIUS_MD = '8px'` at the top (per pattern of PRIMARY/ERROR_COLOR lines 22-23) and use it.

### 3. Letter-Spacing Inconsistent (LOW)

**Current (line 120):**
```typescript
letterSpacing: '0.06em',  // panelLabelStyle
```

**Precedent (ExportModal.styles.ts line 84):**
```typescript
letterSpacing: '0.08em',  // sectionLabel
```

Both are semantic label elements in modals. Design-guide §3 doesn't specify letter-spacing for `label` token, so inconsistency exists across the codebase.

**Fix:** Align with ExportModal and change to `'0.08em'`, or add convention note to design-guide.

## Established Pattern

Modal family (ExportModal, DeleteAssetDialog, RestoreModal) all use design-guide tokens for spacing. This modal should follow the same discipline.

## Status

Marked **COMMENTED** in development_logs.md pending developer fixes. Subtask 5 will pass design review once 20px → 24px spacing changes are applied and border-radius/letter-spacing are aligned.
