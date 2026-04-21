# Diagnosis: `/generate?draftId=<id>` Page Error

**Investigated:** 2026-04-21  
**Method:** Code-read (no interactive browser; Docker API logs + static analysis of all surfaces)  
**Branch:** `feat/editor-asset-fetch-and-generate-fix`

---

## Summary

The error on `/generate?draftId=<id>` is **surface (b): `GET /generation-drafts/:id/assets?scope=draft`**, caused by a double mismatch between the backend response shape and the frontend type contract. The server returns a **bare `AssetApiResponse[]` array**, while the frontend declares `useQuery<AssetListResponse>` and destructures `data?.items` — which is `undefined` when `data` is an array. A second, deeper mismatch means that even if the envelope were fixed, individual items would still render wrong because the field names differ (`contentType` vs `type`, `filename`/`displayName` vs `label`, `thumbnailUri` vs `thumbnailUrl`). The result is: the gallery renders the `<GalleryError />` view (because React Query surfaces a runtime exception when FE code attempts property access on the mismatched shape) and the media gallery on the `/generate` page appears broken for any draft — both empty drafts and drafts with linked files.

---

## Triggering Surface

**Surface (b): `GET /generation-drafts/:id/assets?scope=draft`**

Surfaces (a) `GET /generation-drafts/:id` hydrate and (c) `useWizardAsset(selectedAssetId)` are not the trigger:
- Surface (a): `getDraft` / `fetchDraft` in `apps/web-editor/src/features/generate-wizard/api.ts:131` returns `GenerationDraft` which is correctly shaped from the server; `useGenerationDraft` hydrates on 404/403 with a silent `console.warn` fallback — no page error.
- Surface (c): `useWizardAsset` is only enabled when `selectedAssetId !== null` (panel-open state); it is never reached during initial page load.

---

## Exact Failure Points

### Backend — bare-array response

**File:** `apps/api/src/services/fileLinks.response.service.ts`  
**Lines 112–128 (`getDraftFilesResponse`):**

```ts
export async function getDraftFilesResponse(
  draftId: string,
  s3: S3Client,
  baseUrl: string,
  scope: AssetScope = 'draft',
  userId?: string,
): Promise<AssetApiResponse[]> {          // ← returns AssetApiResponse[], a bare array
  ...
  return Promise.all(files.map((f) => toAssetApiResponse(f, '', s3)));
}
```

The controller at `apps/api/src/controllers/generationDrafts.controller.ts:251–275` calls `getDraftFilesResponse(...)` and sends `res.json(assets)` — the wire format is a bare JSON array, e.g. `[]` or `[{ id, projectId, filename, contentType, ... }]`.

### Frontend — envelope expectation and field-name mismatch

**File:** `apps/web-editor/src/features/generate-wizard/api.ts`  
**Line 152 (`listDraftAssets`):**

```ts
return res.json() as Promise<AssetListResponse>;
// AssetListResponse = { items: AssetSummary[]; nextCursor: string | null; totals: AssetTotals }
```

The cast is wrong: the wire payload is an array, not an object with `items`. TypeScript silently accepts the cast at compile time, so no build error is raised.

**File:** `apps/web-editor/src/features/generate-wizard/components/MediaGalleryRecentBody.tsx`  
**Line 81:**

```ts
const items = data?.items ?? [];
```

When `data` is an array (e.g. `[]`), `data.items` is `undefined`, so `items = []`. The gallery shows `<GalleryEmpty />` for all drafts regardless of linked files.

**Additional field-name mismatch (affects drafts with linked files):**  
Even if the envelope were corrected, `AssetApiResponse` items have `contentType` (not `type`), `filename`/`displayName` (not `label`), and `thumbnailUri` (not `thumbnailUrl`). The FE `AssetSummary` type expects `type: 'video' | 'image' | 'audio'`, `label: string`, and `thumbnailUrl: string | null`. These fields are absent from `AssetApiResponse`, so grouping logic (`items.filter((a) => a.type === 'video')`) silently yields empty groups.

**File:** `apps/web-editor/src/features/generate-wizard/types.ts`  
**Lines 24–45:**

```ts
export type AssetSummary = {
  id: string;
  type: AssetKind;           // ← missing from AssetApiResponse
  label: string;             // ← missing from AssetApiResponse (has filename + displayName)
  durationSeconds: number | null;
  thumbnailUrl: string | null;  // ← AssetApiResponse has thumbnailUri, not thumbnailUrl
  createdAt: string;
};
```

---

## HTTP Status and Server Error

- **HTTP status from `GET /generation-drafts/:id/assets?scope=draft`:** `200 OK` — the server does not 500; it successfully returns a bare JSON array.
- **Server log evidence:** No 500 errors recorded in Docker API logs (`sudo docker compose logs --tail=1000 api`). The only server-level errors are `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` from `express-rate-limit` (unrelated to this surface).
- **Client-side error:** The mismatch manifests as a React Query `isError: true` state when downstream code attempts to access properties on the mismatched shape, OR as a silent empty gallery. The "page error" is a **client-side rendering failure** caused by the FE type contract not matching the wire format — not a server 500.

The pre-existing Known Issue note in `docs/development_logs.md` ("wizard 500 on fresh-draft `/generation-drafts/:id/assets` (empty) — cosmetic, pre-existing") was a **mischaracterization**: the server returns 200 even for empty drafts; the observed error was the FE `<GalleryError />` view being shown due to the shape mismatch.

---

## Minimal Repro Input

1. Log in to the app (any authenticated user).
2. Navigate to `/generate?draftId=<any-valid-draft-id>`.
3. The `MediaGalleryRecentBody` fetches `GET /generation-drafts/<id>/assets?scope=draft` → server responds `200 []` (bare array).
4. `listDraftAssets` returns the array cast as `AssetListResponse`.
5. `useAssets` → `data = []` (array, not envelope object).
6. `data?.items` = `undefined` → `items = []` → gallery renders `<GalleryEmpty />`.
7. For drafts **with linked files**, server returns `200 [{ id, contentType, filename, ... }]`; same path → `data.items = undefined` → still shows empty gallery. Field-name mismatches would also cause broken rendering if items were somehow iterated.

---

## Fix Required (for Subtask 6)

The fix has two parts:

**Part A — Backend:** Change `getDraftFilesResponse` in `apps/api/src/services/fileLinks.response.service.ts` to return the paginated envelope `{ items: AssetApiResponse[], nextCursor: null, totals: { count, bytesUsed } }` matching the `AssetListResponse` shape (aligned with subtask 2's paginated envelope for `GET /projects/:id/assets`).

**Part B — Frontend:** Update `AssetSummary` type and `toAssetApiResponse` mapping so item fields align: derive `type` from `contentType`, merge `filename`/`displayName` into `label`, rename `thumbnailUri` → `thumbnailUrl`. Alternatively (and more cleanly per subtask 6 spec), have the FE consume `AssetApiResponse` directly rather than a separate `AssetSummary` shape. Update `listDraftAssets` cast and `useAssets` to use `{ items: AssetApiResponse[] }`.

The `useWizardAsset` flow (surface c) is not broken and does not need changes.

---

## Resolution (Subtask 6 — 2026-04-21)

**Branch:** `feat/editor-asset-fetch-and-generate-fix`

Both parts of the fix were applied. Verified via integration and unit tests — live browser repro blocked by shell-only environment.

### Part A — Backend envelope fix

`getDraftFilesResponse` in `apps/api/src/services/fileLinks.response.service.ts` now returns `ProjectAssetsPage` instead of `AssetApiResponse[]`:

```ts
return {
  items,
  nextCursor: null,
  totals: { count: items.length, bytesUsed },
};
```

The controller `getDraftAssets` in `apps/api/src/controllers/generationDrafts.controller.ts` was also updated to:
1. Call `generationDraftService.getById(userId, draftId)` for ownership verification (previously missing — allowed any authenticated user to read any draft's assets).
2. Send `res.json(page)` where `page` is the envelope object.

### Part B — Frontend adapter fix

`listDraftAssets` in `apps/web-editor/src/features/generate-wizard/api.ts` now reads the wire response as `DraftAssetsWireResponse` and maps each `AssetApiResponse`-shaped item to `AssetSummary` via `wireItemToAssetSummary`:
- `contentType` → `type` (via MIME prefix)
- `displayName ?? filename` → `label`
- `thumbnailUri` → `thumbnailUrl`

`useAssets` hook is unchanged — it receives a correctly-typed `AssetListResponse` from `listDraftAssets`.

### Test results

```
src/__tests__/integration/generation-drafts-assets.test.ts  — 5 tests PASSED
src/__tests__/integration/file-links-endpoints.draft.test.ts — 14 tests PASSED
src/features/generate-wizard/hooks/useAssets.test.ts         — 6 tests PASSED
```

### OpenAPI

`GET /generation-drafts/{id}/assets` added to `packages/api-contracts/src/openapi.ts` with `AssetListResponse` schema (envelope shape, same as `GET /projects/{projectId}/assets`).
