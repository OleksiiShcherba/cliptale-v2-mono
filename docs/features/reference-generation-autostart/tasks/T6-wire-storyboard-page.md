---
id: T6
title: "Wire useCastAutostart + manual control into StoryboardPage"
layer: wiring
deps: ["T4", "T5"]
acs: ["AC-01", "AC-05", "AC-07"]
files_hint:
  - "apps/web-editor/src/features/storyboard/components/StoryboardPage.tsx"
owner: "Oleksii (Storyboard squad)"
estimate: "M"
status: "todo"
---

# T6 — Wire the hook + manual control into `StoryboardPage`

## Why

`StoryboardPage` currently holds `castExtraction` in local `useState`, starts extraction only on the manual `handleStartCastExtraction` click, and polls ad-hoc while the modal is open ([sad §5](../sad.md)). To deliver auto-start (US-01) and converge the manual + auto paths on one cache entry, the page must consume `useCastAutostart` (T5) and render the refactored modal (T4).

## What

In `StoryboardPage.tsx`:
- Mount `useCastAutostart(safeDraftId)` so the free extraction auto-starts on Step-2 entry; remove the local `castExtraction` `useState` + the ad-hoc poll effect, sourcing extraction state from the hook's `['cast-extraction', draftId]` query (AC-01).
- Auto-start must **not** open the modal — `castModalOpen` stays false until the Creator acts (spec §1¶4, OQ-2 default).
- The manual "Start reference generation" control (`onStartReferenceGeneration` / `handleStartCastExtraction`) **always opens** the Cast confirmation modal — in every entry case, not only after a failure — and **surfaces the existing extraction** rather than starting a second (AC-05, AC-07). It calls the now-idempotent start (T1), so a concurrent/existing job returns the same job, no second row.
- `handleConfirmCast` stays wired to `confirmCast` unchanged (consent gate, AC-04 — out of scope to change).

## Definition of Done

- [ ] Entering Step 2 on a draft with no extraction issues one silent auto-start and does **not** open the modal (AC-01).
- [ ] Re-entry / re-mount on a draft that already has an extraction starts nothing new and keeps it available (AC-05).
- [ ] The manual control always opens the modal and shows the existing extraction (or starts one if none) without charging (AC-07).
- [ ] Local `castExtraction` useState + ad-hoc poll removed; state flows from the hook query.
- [ ] `StoryboardPage` tests updated/pass; vitest (from `apps/web-editor`) passes; no new type errors in changed files.

## Notes

- Joins the modal lane (T4) and the hook lane (T5); the only task touching `StoryboardPage.tsx`.
- Hard rule: do not change `confirmCast` / paid-generation behavior (spec §3).
