---
name: Subtask 3 — AssetDetailPanel compact/fluid layout — APPROVED
description: Dual-mode panel styles (280×620 fixed vs 100% fluid maxWidth 520px) for editor sidebar and wizard contexts; all tokens verified
type: project
---

**Status:** APPROVED (2026-04-21)

**What was reviewed:**
- `apps/web-editor/src/shared/asset-detail/assetDetailPanel.styles.ts` — `getAssetDetailPanelStyles(compact: boolean)` factory converting static styles to parameterized function
- `apps/web-editor/src/shared/asset-detail/AssetDetailPanel.tsx` — optional `compact?: boolean` prop (default true)
- `apps/web-editor/src/features/generate-wizard/components/WizardAssetDetailSlot.tsx` — passes `compact={false}` to panel
- `apps/web-editor/src/features/generate-wizard/components/generateWizardPage.styles.ts` — rightColumn padding changed from '0' to '24px'

**All checks passed:**

### Color Tokens (§3 design-guide)
✅ SURFACE_ALT #16161F (line 7)
✅ SURFACE_ELEVATED #1E1E2E (line 8)
✅ TEXT_PRIMARY #F0F0FA (line 9)
✅ TEXT_SECONDARY #8A8AA0 (line 10)
✅ BORDER #252535 (line 11)
✅ ERROR #EF4444 (line 12)
✅ PRIMARY #7C3AED (line 13)

### Typography (§3 design-guide)
✅ label: 12px / 500 weight (line 64–70, design-guide line 93)
✅ body: 14px / 400 weight (lines 79, 162, 179, design-guide line 91)
✅ body-sm: 12px / 400 weight (lines 148–150, design-guide line 92)
✅ caption: 11px / 400 weight (lines 123–124, design-guide line 94)
✅ fontFamily: Inter (line 52, design-guide §3)

### Spacing (§3 design-guide, 4px base unit)
✅ root padding: 16 = space-4 (line 49)
✅ root gap: 16 = space-4 (line 51)
✅ rightColumn padding: 24 = space-6 (generateWizardPage.styles.ts line 69)
✅ All container padding/gap values are 4px-grid multiples

### Border Radius (§3 design-guide)
✅ radius-md: 8px (lines 87, 136, 158)
✅ radius-sm: 4px (line 80)
✅ radius-full: 9999px (line 122)

### Layout & Sizing
✅ **Compact mode (compact=true):** root 280px width, 620px fixed height, children 248px width
✅ **Fluid mode (compact=false):** root 100% width, maxWidth 520px, minHeight 620px, children 100% width, maxWidth 480px
✅ Preserves editor sidebar layout (280×620) unchanged
✅ Correctly implements wizard right-column embedding with breathing room (24px padding)

### Test Coverage
✅ getAssetDetailPanelStyles.test.ts — 21 unit tests locked in all width/height branches
✅ AssetDetailPanel.fluid.test.tsx — 11 component tests asserting both compact modes and draft-context behavior
✅ WizardAssetDetailSlot.test.tsx — 8 tests covering loading state, prop forwarding, context propagation
✅ All 38 existing tests remain green

**OQ-2 Preference on maxWidth 520 vs AI panel 720:**

The AssetDetailPanel.fluid maxWidth of 520px is appropriate for the wizard's right-column context:
- Wizard layout: `gridTemplateColumns: '8fr 4fr'` → right column is ~33% of total width
- At 1440px desktop width (design-guide §9), right column ≈ 480px logical width
- With 24px padding per side, usable space ≈ 432px
- maxWidth 520px provides comfortable breathing room while respecting column boundaries

The AI panel's maxWidth 720px serves a different (wider) embedding context. Both choices are contextually appropriate and do not conflict.

**Key design decision ratified:**
Per-file typed hex constants continue as the established pattern (no CSS custom properties per design-guide §9 and prior approvals in Subtask B5).
