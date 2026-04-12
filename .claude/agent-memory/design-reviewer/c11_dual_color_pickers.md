---
name: C11 Dual Color Pickers — Design Review APPROVED
description: Caption clip dual color picker (active/inactive) extends CaptionEditorPanel with two hex inputs; all design tokens verified, no violations found
type: reference
---

## Subtask: C11 — CaptionEditorPanel: dual color pickers for caption clips

**Status:** ✅ APPROVED (2026-04-12)

**What was reviewed:**
- `apps/web-editor/src/features/captions/components/CaptionEditorPanel.tsx` (lines 139-171)
- Added two new `<input type="text">` hex fields when `clip.type === 'caption' && editors.type === 'caption'`
- Active word color and inactive word color inputs with proper aria-labels
- Text-overlay single color input path remains unchanged

**Key findings:**

**Color Tokens** (all verified against design-guide §3):
- Input background: `#0D0D14` = `surface` token
- Input border: `#252535` = `border` token
- Input text color: `#F0F0FA` = `text-primary` token
- Input font size: `14px` = `body` token
- Input border radius: `4px` = `radius-sm` token
- Label color: `#8A8AA0` = `text-secondary` token
- Label font size: `12px`, weight `500` = `label` token

**Spacing** (all verified against 4px grid):
- Field gap: `4px` (space-1)
- Row gap: `8px` (space-2)
- Panel gap: `12px` (space-3)
- Input padding: `8px` (space-2)

**Typography:**
- Font family: `Inter, sans-serif` ✓
- Label line height: `16px` ✓
- Label letter-spacing: `0.05em` ✓
- Body font size: `14px` ✓

**Labels & Accessibility:**
- "ACTIVE WORD COLOR" (UPPERCASE) ✓
- "INACTIVE WORD COLOR" (UPPERCASE) ✓
- `aria-label="Active word color (hex)"` ✓
- `aria-label="Inactive word color (hex)"` ✓

**Test Coverage:**
- Rendering tests: both inputs present (CaptionEditorPanel.caption.test.tsx lines 42-50) ✓
- Field-value tests: inputs show correct `clip.activeColor` / `clip.inactiveColor` values (lines 74-85) ✓
- Interaction tests: `setActiveColor` / `setInactiveColor` callbacks fired correctly (lines 117-129) ✓
- All 39 tests pass (17 caption-specific + 22 text-overlay backward-compat)

**No regressions:**
- Text-overlay single COLOR input (lines 122-137) unchanged ✓
- Text textarea, shared fields all render correctly ✓
- Both new inputs use `style={styles.input}` for consistency ✓

**Notes for future reviewers:**
- Dual-path rendering uses `clip.type` AND `editors.type` guards (mirrors text-overlay pattern, protects against type drift)
- Placeholder values match C8 default colors: `#FFFFFF` and `rgba(255,255,255,0.35)`
- No hardcoded non-token colors anywhere in the implementation
