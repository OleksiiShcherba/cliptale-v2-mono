/**
 * storyboardPipeline.confirm.canvas.ts — canvas-build helpers for confirmCast (T6)
 *
 * Extracted from storyboardPipeline.confirm.service.ts to keep that file under 300 lines.
 * These three pure functions build the base-flow canvas, generation options, and prompt
 * text for each reference block that confirmCast creates.
 */

import { randomUUID } from 'node:crypto';

import { REFERENCE_DEFAULT_MODEL_ID } from '@/services/storyboardReference.confirm.service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One cast entry parsed from the completed cast-extraction proposal_json. */
export type ProposalCastEntry = {
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  /** Scene-block UUIDs this reference covers (from the proposal; may be empty). */
  sceneBlockIds: string[];
};

// ── Canvas-build helpers ──────────────────────────────────────────────────────

export function buildReferencePrompt(entry: ProposalCastEntry): string {
  return entry.description?.trim() || entry.name;
}

export function buildReferenceOptions(entry: ProposalCastEntry): Record<string, unknown> {
  return {
    prompt: buildReferencePrompt(entry),
    image_size: 'square_hd',
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };
}

/**
 * Builds the base-flow canvas for a pipeline-confirmed reference.
 *
 * Seeds the full visible chain — (optional) text-content → generation → result —
 * so opening the flow shows the auto-generated output instead of an empty canvas.
 * Mirrors storyboardReference.confirm.service.buildReferenceCanvas, but without
 * imageFileIds (pipeline proposals carry only description/name).
 */
export function buildReferenceCanvas(entry: ProposalCastEntry): {
  canvas: { blocks: unknown[]; edges: unknown[] };
  genBlockId: string;
} {
  const blocks: unknown[] = [];
  const edges: unknown[] = [];

  if (entry.description?.trim()) {
    const contentId = randomUUID();
    blocks.push({
      blockId: contentId,
      type: 'content',
      position: { x: 0, y: 0 },
      params: { contentType: 'text', text: entry.description.trim(), modality: 'text' },
    });
    const genBlockId = randomUUID();
    blocks.push({
      blockId: genBlockId,
      type: 'generation',
      position: { x: 340, y: 0 },
      params: { modelId: REFERENCE_DEFAULT_MODEL_ID },
    });
    edges.push({
      edgeId: randomUUID(),
      sourceBlockId: contentId,
      sourceHandle: 'out',
      targetBlockId: genBlockId,
      targetHandle: 'prompt',
    });
    const resultBlockId = randomUUID();
    blocks.push({
      blockId: resultBlockId,
      type: 'result',
      position: { x: 680, y: 0 },
      params: { sourceBlockId: genBlockId },
    });
    edges.push({
      edgeId: randomUUID(),
      sourceBlockId: genBlockId,
      sourceHandle: 'out',
      targetBlockId: resultBlockId,
      targetHandle: 'in',
    });
    return { canvas: { blocks, edges }, genBlockId };
  }

  // No description — just generation → result.
  const genBlockId = randomUUID();
  blocks.push({
    blockId: genBlockId,
    type: 'generation',
    position: { x: 340, y: 0 },
    params: { modelId: REFERENCE_DEFAULT_MODEL_ID },
  });
  const resultBlockId = randomUUID();
  blocks.push({
    blockId: resultBlockId,
    type: 'result',
    position: { x: 680, y: 0 },
    params: { sourceBlockId: genBlockId },
  });
  edges.push({
    edgeId: randomUUID(),
    sourceBlockId: genBlockId,
    sourceHandle: 'out',
    targetBlockId: resultBlockId,
    targetHandle: 'in',
  });
  return { canvas: { blocks, edges }, genBlockId };
}
