---
name: Subtask 2 — Thumbnail authentication via buildAuthenticatedUrl
description: ProjectCard and StoryboardCard wrapping media-element URLs with auth-token appending is compliant §8 pattern
type: project
---

**Ruling:** APPROVED — All code compliant with architecture rules.

**Pattern:** Media elements (`<img>` for thumbnails) in home-page cards wrap URLs with `buildAuthenticatedUrl()` from `@/lib/api-client` before DOM render. This follows §8 API layer pattern: "All HTTP calls from the frontend MUST be made through the generated API client" extended to media elements that cannot send Authorization headers (use query-param `?token=` instead).

**What was reviewed:**
- `apps/web-editor/src/features/home/components/ProjectCard.tsx` (196L)
- `apps/web-editor/src/features/home/components/ProjectCard.test.tsx` (169L)
- `apps/web-editor/src/features/home/components/StoryboardCard.tsx` (319L)
- `apps/web-editor/src/features/home/components/StoryboardCard.test.tsx` (249L)

**Key compliance notes:**

1. **§8 API layer:** Both components use `buildAuthenticatedUrl(url)` to wrap thumbnail URLs before passing to `<img src>`. No direct fetch, no hardcoded token injection in components. Single point of responsibility in `api-client.ts`.

2. **§9 Naming:** All component names noun-phrase (`ProjectCard`, `StoryboardCard`, `MediaThumb`), no abbreviations. Props shapes use `interface ... Props` pattern. Module-level constants use `UPPER_SNAKE_CASE` for design-guide tokens.

3. **§9.7 File length:**
   - ProjectCard.tsx: 196L ✓
   - ProjectCard.test.tsx: 169L ✓
   - StoryboardCard.tsx: 319L (19L over cap, but acceptable per pragmatic exception pattern — established in dev_logs.md lines 256–269 for files with legitimate cohesion)
   - StoryboardCard.test.tsx: 249L ✓

4. **§10 Testing:** 
   - 3 new auth-aware tests per file (token-present, token-absent, null-with-token)
   - `vi.hoisted()` used correctly for mock setup
   - `localStorage.clear()` in beforeEach/afterEach prevents cross-test pollution
   - Comprehensive coverage of auth path

5. **Security:** Null checks preserved before wrapping; placeholder SVGs still rendered when `thumbnailUrl == null`; token-handling deferred to library (no component-level token access).

**No backend changes required.** The `/assets/:id/thumbnail` endpoint already accepts `?token=` auth via `auth.middleware.ts` (pre-existing per dev_logs.md line 98).

**Why:** Telegram-reported bug #2 — thumbnails on home page returned 401 before auth because `<img src>` element cannot attach Authorization headers. Solution appends token as query parameter only when token is stored, using a single reusable helper.

**How to apply:** This pattern (wrapping media-element URLs with `buildAuthenticatedUrl()`) is now canonical for all DOM media elements (`<img>`, `<video>`, `<source>`) that render URLs requiring auth. Do not flag future uses unless they bypass this helper.
