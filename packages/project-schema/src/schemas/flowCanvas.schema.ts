/**
 * Zod schema for the `generation_flows.canvas` JSON document.
 *
 * The canvas stores the whole node graph — blocks, edges, positions, and per-block
 * params — as a single JSON document (ADR-0002). It is validated here in
 * packages/project-schema, imported by both api and web-editor; the DB column
 * itself has no JSON schema constraint.
 *
 * Shape matches the data-model.md §canvas and contracts/openapi.yaml (T4 / AC-10).
 */

import { z } from 'zod';

// ── Block type discriminant ───────────────────────────────────────────────────

export const flowBlockTypeSchema = z.enum(['content', 'generation', 'result']);
export type FlowBlockType = z.infer<typeof flowBlockTypeSchema>;

// ── Position ──────────────────────────────────────────────────────────────────

export const flowPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export type FlowPosition = z.infer<typeof flowPositionSchema>;

// ── Block ─────────────────────────────────────────────────────────────────────

/**
 * One canvas block (content / generation / result).
 *
 * - `blockId` — stable UUID, lives inside the JSON; referenced by flow_files + ai_generation_jobs.block_id.
 * - `type`    — discriminant used by the UI renderer and the server-side validation gate.
 * - `position` — { x, y } canvas coordinates (driven by @xyflow/react).
 * - `params`  — open record: generation blocks carry model params; content blocks
 *               carry text/fileId; result blocks carry their source blockId reference.
 *               Not schema-constrained at this layer — validated by the generation-gate
 *               service (T11) and by per-block UI components (T17/T18).
 */
export const flowBlockSchema = z
  .object({
    blockId: z.string().min(1),
    type: flowBlockTypeSchema,
    position: flowPositionSchema,
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type FlowBlock = z.infer<typeof flowBlockSchema>;

// ── Edge ──────────────────────────────────────────────────────────────────────

/**
 * One typed connection between two blocks.
 *
 * - `edgeId`        — stable string id (typically a UUID or deterministic composite).
 * - `sourceBlockId` / `targetBlockId` — reference block.blockId values in the same canvas.
 * - `sourceHandle`  / `targetHandle`  — port names on the source/target node (used for
 *                                        typed-connection validation, AC-02).
 */
export const flowEdgeSchema = z
  .object({
    edgeId: z.string().min(1),
    sourceBlockId: z.string().min(1),
    sourceHandle: z.string().min(1),
    targetBlockId: z.string().min(1),
    targetHandle: z.string().min(1),
  })
  .strict();

export type FlowEdge = z.infer<typeof flowEdgeSchema>;

// ── Canvas (root document) ────────────────────────────────────────────────────

/**
 * The complete canvas document persisted in `generation_flows.canvas` (ADR-0002).
 *
 * `blocks` and `edges` are the only top-level arrays; all position and per-block
 * params travel inside each block object so a single JSON column reload restores
 * the full visual + parameter state (AC-10).
 */
export const flowCanvasSchema = z
  .object({
    blocks: z.array(flowBlockSchema),
    edges: z.array(flowEdgeSchema),
  })
  .strict();

export type FlowCanvas = z.infer<typeof flowCanvasSchema>;
