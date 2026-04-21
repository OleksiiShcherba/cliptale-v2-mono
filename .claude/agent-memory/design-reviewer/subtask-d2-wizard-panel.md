---
name: Subtask D2 — Wizard: open panel on asset click
description: WizardAssetDetailSlot loading state + generateWizardPage layout styles; 2 token-consistency issues COMMENTED
type: project
---

**Status:** APPROVED (2026-04-20)

**Design decision confirmed:** Per-file typed hex constants are the established convention in the codebase (verified in ProjectCard.tsx, StoryboardCard.tsx, undoToast.styles.ts, aiGenerationPanelTokens.ts). CSS custom properties (`var(--…)`) are not used anywhere. This pattern was explicitly ratified in Subtask B5 Fix round 1.

**What was reviewed:**
- `apps/web-editor/src/features/generate-wizard/components/generateWizardPage.styles.ts` (new file, 84 lines with JSDoc)
- `apps/web-editor/src/features/generate-wizard/components/WizardAssetDetailSlot.tsx` (new file, 76 lines)
- `apps/web-editor/src/features/generate-wizard/components/GenerateWizardPage.tsx` (modified, integration point)
- `apps/web-editor/src/features/generate-wizard/hooks/useWizardAsset.ts` (new hook, backend data-fetching only)

**All checks passed:**
- ✅ Color constants (SURFACE, SURFACE_ALT, SURFACE_ELEVATED, BORDER, TEXT_PRIMARY) all verified against design-guide §3
- ✅ Typography: `fontSize: 14`, `fontFamily: 'Inter'` correct for loading state and all text elements
- ✅ All padding values 4px-grid-aligned (24px = `space-6`, 12px = `space-3`)
- ✅ Spacing: `gap: '12px'` = `space-3` (3 × 4px base unit) — correct
- ✅ Layout & component composition follows D1 pattern (AssetDetailPanel integration)
- ✅ Loading state visuals match existing wizard surfaces
- ✅ Right-column state management preserves gallery on close
- ✅ JSDoc added documenting the per-file constant convention and design-guide alignment

**Related:**
- Subtask D1 (AssetDetailPanel parameterization) — D2 inherits correct panel styles, no issues
- Subtask B5 (Fix round 1) — explicitly ratified per-file constants as the project's established pattern
