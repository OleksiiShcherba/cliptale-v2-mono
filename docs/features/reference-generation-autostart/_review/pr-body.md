## Summary

Step-2 of a storyboard draft now **auto-starts the free cast extraction** in the background when a draft has none yet (no manual "Start reference generation" click), and the Cast confirmation surface now renders as a **proper dialog** in every state — fixing the *stray-buttons defect* where the pre-proposal state showed two unstyled buttons at the bottom of the page. Repeated entries can never create a duplicate extraction. Spec: `docs/features/reference-generation-autostart/spec.md`.

## Acceptance criteria

- AC-01 — free cast extraction auto-starts on Step-2 entry when none exists ✓
- AC-02 — Cast confirmation surface is a real dialog in every state; 0 stray buttons ✓
- AC-03 — extraction progress visible without a confirm action ✓
- AC-04 — paid generation charged only after explicit Cost confirmation (single consent point preserved) ✓
- AC-05 — exactly one extraction per draft across repeated entries (idempotent start) ✓
- AC-06 — completed-but-empty extraction shows a distinct close-only state ✓
- AC-07 — never-started auto-start recoverable via the manual control ✓

## Design

- Spec: `docs/features/reference-generation-autostart/spec.md`
- Architecture: `docs/features/reference-generation-autostart/sad.md`
- Decisions: `docs/features/reference-generation-autostart/adr/0001-idempotent-cast-extraction-start.md`
- API: `docs/features/reference-generation-autostart/contracts/openapi.yaml`
- Data model: `docs/features/reference-generation-autostart/data-model.md` (no migration — behavioral change only)
- Changelog: `docs/features/reference-generation-autostart/CHANGELOG.md`

## Tasks (SDD-Task trailers)

- `22862ac` feat: idempotent startExtraction + widen status union
- `7e9e7f1` test: integration proof of idempotent start (QG-3)
- `45bd6e9` feat: wrap every CastConfirmModal state in a dialog shell
- `bb7a372` feat: distinct in-progress / proposal-ready / completed-empty modal states
- `16ec139` feat: useCastAutostart hook + widen client start union
- `ec23d58` feat: wire useCastAutostart + manual control into StoryboardPage
- `7fdbdcb` test: UI regression — 0 stray buttons, single start, consent preserved

## Verification

- Unit + component: **86/86 green** (`useCastAutostart` 6, `CastConfirmModal` 59, `StoryboardPage` 21) — `apps/web-editor`, vitest.
- Integration: **4/4 green** against real MySQL — `storyboardReference.extraction.service.integration.test.ts`; QG-3 asserts the idempotency invariant (2nd start → same job id, row COUNT=1; failed→fresh queues a new row, COUNT=2).
- Lint + typecheck: pre-existing-broken repo-wide (not introduced by this change); not part of the green gate.
- Ran the feature: AC-05/AC-07 idempotency exercised end-to-end against a real database (integration). UI ACs (AC-01/02/03/04/06) exercised through the real React components with Testing Library interactions. Full browser e2e of AC-01/04/07 is **deferred to the pre-release CI track** per the test-plan's explicit split — every UI AC retains component + wiring coverage, so no AC is backend-only.

## Operational notes

- Migration: none — purely behavioral (idempotency logic + dialog rendering); no schema change.
- Feature flag / config: none.
- Rollback: revert the branch/deploy; no data migration to reverse.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
