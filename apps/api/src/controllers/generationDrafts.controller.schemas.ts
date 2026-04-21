/**
 * Zod schemas for the generationDrafts controller — extracted to keep
 * `generationDrafts.controller.ts` under the §9.7 300-line cap.
 *
 * Exported schemas:
 *   draftAssetsScopeSchema       — GET /generation-drafts/:id/assets query string
 *   submitDraftAiGenerationSchema — POST /generation-drafts/:draftId/ai/generate body
 *   linkFileToDraftSchema        — POST /generation-drafts/:draftId/files body
 *   upsertDraftBodySchema        — POST /generation-drafts and PUT /generation-drafts/:id body
 */
import { z } from 'zod';

/** `scope` query param for `GET /generation-drafts/:id/assets`. Default: `draft` (linked only). `all` returns the user's entire library. `project` is not valid here — use the projects endpoint. */
export const draftAssetsScopeSchema = z.object({
  scope: z.enum(['all', 'draft']).default('draft'),
});

/**
 * Zod schema for POST /generation-drafts/:draftId/ai/generate.
 *
 * Mirrors aiGeneration.controller.submitGenerationSchema but lives here to keep
 * the controller files decoupled. No `projectId` compat shim needed — this is a
 * new endpoint, not a migration of the project-scoped one.
 */
export const submitDraftAiGenerationSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000).optional(),
  options: z.record(z.unknown()).default({}),
});

/** Zod schema for POST /generation-drafts/:draftId/files body. Exported for route middleware. */
export const linkFileToDraftSchema = z.object({
  fileId: z.string().uuid(),
});

/**
 * Zod schema for POST /generation-drafts and PUT /generation-drafts/:id request bodies.
 *
 * The payload wraps the PromptDoc rather than flattening it, consistent with
 * the project convention (confirmed by reading assets.controller.ts where the
 * upload body wraps distinct fields; wrapping here keeps the shape unambiguous
 * and allows future addition of metadata alongside promptDoc without a breaking change).
 *
 * The promptDoc value is passed as-is to the service, which runs the full
 * promptDocSchema validation and throws UnprocessableEntityError on failure.
 */
export const upsertDraftBodySchema = z.object({
  promptDoc: z.record(z.unknown()),
});
