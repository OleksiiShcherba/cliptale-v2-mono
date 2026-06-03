/**
 * useFlowCanvas — pure connection-validation + model-reconciliation logic tests.
 *
 * TDD cycle (T17 / AC-02 / AC-07 / AC-15 / AC-18):
 *   - a generation node exposes the right typed input handles for a model
 *   - a result block's output modality derives from its source generation model's group
 *   - an incompatible connection is rejected with the expected-modality hint (AC-02)
 *   - a compatible connection (incl. result→input) is accepted (AC-18)
 *   - changing the model rebuilds handles, prunes incompatible edges (reporting which),
 *     and preserves existing result blocks + their edges (AC-07)
 *
 * These exercise the extracted pure functions so the rules are tested without relying
 * solely on rendering xyflow.
 */

import { describe, it, expect } from 'vitest';

import type { FlowCanvas } from '@ai-video-editor/project-schema';

import {
  requiredHandlesForModel,
  blockOutputModality,
  validateConnection,
  reconcileModelChange,
  removeBlockFromCanvas,
  removeEdgeFromCanvas,
} from './useFlowCanvas';

// ── Fixtures ────────────────────────────────────────────────────────────────

// kling/o3 image-to-video: required image_url (image), exclusiveGroup prompt/multi_prompt (text)
const KLING = 'fal-ai/kling-video/o3/standard/image-to-video';
// ltx-2 image-to-video: required image_url (image) + prompt (text)
const LTX = 'fal-ai/ltx-2-19b/image-to-video';
// text-to-image: required prompt (text), no image input
const NANO = 'fal-ai/nano-banana-2';
// text-to-speech: required text (text)
const TTS = 'elevenlabs/text-to-speech';

function canvasWith(blocks: FlowCanvas['blocks'], edges: FlowCanvas['edges'] = []): FlowCanvas {
  return { blocks, edges };
}

// ── requiredHandlesForModel (AC-15 typed handles) ─────────────────────────────

describe('requiredHandlesForModel', () => {
  it('returns one handle per required modality field for an image-to-video model', () => {
    const handles = requiredHandlesForModel(LTX);
    const byField = Object.fromEntries(handles.map((h) => [h.fieldName, h]));
    expect(byField['image_url'].modality).toBe('image');
    expect(byField['prompt'].modality).toBe('text');
  });

  it('includes a modality-bearing exclusiveGroup member as a handle even when required:false (kling prompt)', () => {
    const handles = requiredHandlesForModel(KLING);
    const names = handles.map((h) => h.fieldName);
    expect(names).toContain('image_url'); // required image
    expect(names).toContain('prompt'); // exclusiveGroup text — has modality, gets a handle
    // multi_prompt is part of the XOR but has no media modality (string_list) → no typed
    // handle; it is supplied via the inspector and exclusivity is enforced server-side.
    expect(names).not.toContain('multi_prompt');
  });

  it('marks an image_url_list field as a multi-handle ("three dots") input', () => {
    const handles = requiredHandlesForModel('fal-ai/nano-banana-2/edit');
    const list = handles.find((h) => h.fieldName === 'image_urls');
    expect(list).toBeDefined();
    expect(list!.isList).toBe(true);
    expect(list!.modality).toBe('image');
  });

  it('returns no image handle for a pure text-to-image model', () => {
    const handles = requiredHandlesForModel(NANO);
    expect(handles.some((h) => h.modality === 'image')).toBe(false);
    expect(handles.some((h) => h.fieldName === 'prompt' && h.modality === 'text')).toBe(true);
  });
});

// ── blockOutputModality ───────────────────────────────────────────────────────

describe('blockOutputModality', () => {
  it('derives a content block output modality from its contentType/modality param', () => {
    const canvas = canvasWith([
      { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'hi', modality: 'text' } },
    ]);
    expect(blockOutputModality(canvas.blocks[0], canvas)).toBe('text');
  });

  it('derives a result block output modality from its source generation model group (video)', () => {
    const canvas = canvasWith([
      { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
      { blockId: 'r1', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'g1' } },
    ]);
    expect(blockOutputModality(canvas.blocks[1], canvas)).toBe('video');
  });
});

// ── validateConnection (AC-02 reject, AC-18 result→input accept) ──────────────

describe('validateConnection', () => {
  it('rejects a text content block dropped on an image input handle, with the expected modality', () => {
    const canvas = canvasWith([
      { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', modality: 'text' } },
      { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
    ]);
    const result = validateConnection(canvas, {
      sourceBlockId: 'c1',
      sourceHandle: 'out',
      targetBlockId: 'g1',
      targetHandle: 'image_url',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expectedModality).toBe('image');
      expect(result.reason).toMatch(/image/i);
    }
  });

  it('accepts a text content block dropped on a text input handle', () => {
    const canvas = canvasWith([
      { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', modality: 'text' } },
      { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
    ]);
    const result = validateConnection(canvas, {
      sourceBlockId: 'c1',
      sourceHandle: 'out',
      targetBlockId: 'g1',
      targetHandle: 'prompt',
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a result block (video output) into a compatible model input of another generation block (AC-18)', () => {
    const canvas = canvasWith([
      // g1 produces video
      { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
      { blockId: 'r1', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'g1' } },
      // g2 image-to-video needs an image — should reject video
      { blockId: 'g2', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
    ]);
    // video result into an image handle → reject
    const bad = validateConnection(canvas, {
      sourceBlockId: 'r1', sourceHandle: 'out', targetBlockId: 'g2', targetHandle: 'image_url',
    });
    expect(bad.ok).toBe(false);

    // a result whose source is an image model → accept into image handle
    const imgCanvas = canvasWith([
      { blockId: 'gi', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: NANO } }, // image output
      { blockId: 'ri', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'gi' } },
      { blockId: 'g2', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
    ]);
    const good = validateConnection(imgCanvas, {
      sourceBlockId: 'ri', sourceHandle: 'out', targetBlockId: 'g2', targetHandle: 'image_url',
    });
    expect(good.ok).toBe(true);
  });

  it('rejects a connection to a non-existent handle on the target model', () => {
    const canvas = canvasWith([
      { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', modality: 'text' } },
      { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: NANO } },
    ]);
    const result = validateConnection(canvas, {
      sourceBlockId: 'c1', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'image_url',
    });
    expect(result.ok).toBe(false);
  });
});

// ── reconcileModelChange (AC-07) ──────────────────────────────────────────────

describe('reconcileModelChange', () => {
  it('rebuilds handles, prunes now-incompatible edges and reports them, and preserves result blocks', () => {
    // g1 starts as LTX (image_url + prompt). Edges: image into image_url, text into prompt.
    // A result block r1 hangs off g1 and is preserved.
    const canvas = canvasWith(
      [
        { blockId: 'img', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'asset', fileId: 'f1', modality: 'image' } },
        { blockId: 'txt', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'p', modality: 'text' } },
        { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
        { blockId: 'r1', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'g1' } },
      ],
      [
        { edgeId: 'e-img', sourceBlockId: 'img', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'image_url' },
        { edgeId: 'e-txt', sourceBlockId: 'txt', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'prompt' },
        { edgeId: 'e-res', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
      ],
    );

    // Change g1 to NANO (text-to-image): no image_url handle anymore, keeps prompt.
    const { canvas: next, removedEdges } = reconcileModelChange(canvas, 'g1', NANO);

    // model param updated
    const g1 = next.blocks.find((b) => b.blockId === 'g1')!;
    expect(g1.params.modelId).toBe(NANO);

    // image edge pruned (image_url no longer exists), reported
    expect(next.edges.find((e) => e.edgeId === 'e-img')).toBeUndefined();
    expect(removedEdges.map((e) => e.edgeId)).toContain('e-img');

    // compatible text edge survives
    expect(next.edges.find((e) => e.edgeId === 'e-txt')).toBeDefined();

    // result block + its output edge preserved untouched (AC-07)
    expect(next.blocks.find((b) => b.blockId === 'r1')).toBeDefined();
    expect(next.edges.find((e) => e.edgeId === 'e-res')).toBeDefined();
    expect(removedEdges.map((e) => e.edgeId)).not.toContain('e-res');
  });
});

// ── removeBlockFromCanvas / removeEdgeFromCanvas (delete) ──────────────────────

describe('removeBlockFromCanvas', () => {
  it('removes the block and every edge incident to it, keeping unrelated blocks/edges', () => {
    const canvas = canvasWith(
      [
        { blockId: 'img', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'asset', fileId: 'f1', modality: 'image' } },
        { blockId: 'txt', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'p', modality: 'text' } },
        { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: LTX } },
        { blockId: 'r1', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'g1' } },
      ],
      [
        { edgeId: 'e-img', sourceBlockId: 'img', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'image_url' },
        { edgeId: 'e-txt', sourceBlockId: 'txt', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'prompt' },
        { edgeId: 'e-res', sourceBlockId: 'g1', sourceHandle: 'out', targetBlockId: 'r1', targetHandle: 'in' },
      ],
    );

    const next = removeBlockFromCanvas(canvas, 'g1');

    // g1 gone; all three edges (two into g1, one out of g1) gone — no dangling connection.
    expect(next.blocks.find((b) => b.blockId === 'g1')).toBeUndefined();
    expect(next.edges).toHaveLength(0);

    // unrelated blocks survive.
    expect(next.blocks.map((b) => b.blockId).sort()).toEqual(['img', 'r1', 'txt']);
  });

  it('leaves the canvas effectively unchanged when the block id is unknown', () => {
    const canvas = canvasWith(
      [{ blockId: 'a', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: '', modality: 'text' } }],
      [],
    );
    expect(removeBlockFromCanvas(canvas, 'nope').blocks).toHaveLength(1);
  });
});

describe('removeEdgeFromCanvas', () => {
  it('removes only the named edge, leaving blocks and other edges intact', () => {
    const canvas = canvasWith(
      [
        { blockId: 'txt', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'p', modality: 'text' } },
        { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId: NANO } },
      ],
      [
        { edgeId: 'e-txt', sourceBlockId: 'txt', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'prompt' },
        { edgeId: 'e-other', sourceBlockId: 'txt', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'prompt2' },
      ],
    );

    const next = removeEdgeFromCanvas(canvas, 'e-txt');

    expect(next.edges.map((e) => e.edgeId)).toEqual(['e-other']);
    expect(next.blocks).toHaveLength(2);
  });
});
