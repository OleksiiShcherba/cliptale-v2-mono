---
topic: test infrastructure and component testing quirks
updated: 2026-04-03
---

## Test runner
Vitest with jsdom environment, configured via `vite.config.ts` (no separate `vitest.config.ts`). Path alias `@/` maps to `./src`. Run with `npx vitest run` from `apps/web-editor/`.

## aria-hidden thumbnail images
`AssetCard` renders thumbnail `<img>` elements with `alt=""` inside an `aria-hidden="true"` container div. `screen.getByRole('img')` will NOT find them (aria-hidden removes them from the accessibility tree). Use `container.querySelector('img')` instead. **Why:** The thumbnail is purely decorative, intentionally hidden from assistive tech. **Impact:** All tests asserting on thumbnail presence/src in AssetCard or similar decorative-image components must use DOM querySelector.

## useAssetUpload act() warnings
`src/features/asset-manager/hooks/useAssetUpload.test.ts` emits React `act()` warnings on every run — this is a pre-existing issue from before Epic 3. Tests still pass. Do not investigate or fix as part of unrelated subtasks.

## Mocking crypto.randomUUID in Vitest/jsdom
`crypto.randomUUID` is available via `globalThis.crypto` in jsdom. In tests, mock it with `vi.mock('crypto', () => ({ randomUUID: vi.fn()... }))` — this works cleanly for the web-editor package.
