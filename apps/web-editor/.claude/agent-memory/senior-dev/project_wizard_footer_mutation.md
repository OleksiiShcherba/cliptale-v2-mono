---
name: WizardFooter useMutation pattern
description: WizardFooter wraps deleteDraft in useMutation; tests must include QueryClientProvider
type: project
---

`WizardFooter.tsx` uses `useMutation` from `@tanstack/react-query` to call `deleteDraft` (§7 consistency rule). Any test file rendering `WizardFooter` must wrap it in `<QueryClientProvider client={makeQueryClient()}>`.

**Why:** Fix Round 1 (2026-04-16) — code-reviewer flagged direct `deleteDraft()` call without React Query as a §7 violation. Pattern matches `useGenerationDraft`'s `createMutation`/`updateMutation`.

**How to apply:** When writing tests for `WizardFooter` or components that render it, always include `QueryClientProvider`. The `makeQueryClient` helper creates a fresh client per test with `retry: false, gcTime: 0, mutations: { retry: false }`.
