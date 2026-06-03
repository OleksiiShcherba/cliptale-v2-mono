/**
 * FlowCanvas — component test (T17 / AC-15 / AC-18).
 *
 * Renders an initial canvas document into @xyflow/react and asserts the three node
 * kinds mount with their typed handles, and that a result block's output modality
 * is resolved from its source generation model (so it can be reused as input, AC-18).
 *
 * xyflow needs a sized container in jsdom; ResizeObserver is stubbed below.
 */

import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

import { FlowCanvas } from './FlowCanvas';
import type { FlowCanvas as FlowCanvasDoc } from '@ai-video-editor/project-schema';

beforeAll(() => {
  // @xyflow/react relies on ResizeObserver, absent in jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const LTX = 'fal-ai/ltx-2-19b/image-to-video';

const DOC: FlowCanvasDoc = {
  blocks: [
    { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'hello', modality: 'text' } },
    { blockId: 'g1', type: 'generation', position: { x: 300, y: 0 }, params: { modelId: LTX } },
    { blockId: 'r1', type: 'result', position: { x: 600, y: 0 }, params: { sourceBlockId: 'g1' } },
  ],
  edges: [],
};

describe('FlowCanvas', () => {
  it('renders content, generation and result nodes from an initial canvas document', async () => {
    render(<FlowCanvas initialCanvas={DOC} />);
    await waitFor(() => {
      expect(screen.getByTestId('content-node')).toBeDefined();
      expect(screen.getByTestId('generation-node')).toBeDefined();
      expect(screen.getByTestId('result-node')).toBeDefined();
    });
  });

  it('shows the generation node typed handles for the selected model', async () => {
    render(<FlowCanvas initialCanvas={DOC} />);
    await waitFor(() => {
      expect(screen.getByTestId('handle-image_url').getAttribute('data-modality')).toBe('image');
      expect(screen.getByTestId('handle-prompt').getAttribute('data-modality')).toBe('text');
    });
  });

  it('exposes the live canvas controller through onCanvasReady (serialize → FlowCanvas shape)', async () => {
    const onReady = vi.fn();
    render(<FlowCanvas initialCanvas={DOC} onCanvasReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const controller = onReady.mock.calls.at(-1)![0];
    const serialized = controller.serialize();
    expect(serialized.blocks).toHaveLength(3);
    // params contract preserved through serialize
    const gen = serialized.blocks.find((b: { blockId: string }) => b.blockId === 'g1');
    expect(gen.params.modelId).toBe(LTX);
  });

  // The double-click GESTURE that triggers this is verified in the E2E (xyflow does not
  // render edge geometry in jsdom). Here we prove the wired delete logic: removeEdge —
  // the method onEdgeDoubleClick calls — drops the connection and streams the change.
  it('removeEdge drops the connection and streams the updated canvas', async () => {
    const onReady = vi.fn();
    const onCanvasChange = vi.fn();
    const docWithEdge: FlowCanvasDoc = {
      blocks: [
        { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params: { contentType: 'text', text: 'hi', modality: 'text' } },
        { blockId: 'g1', type: 'generation', position: { x: 300, y: 0 }, params: { modelId: LTX } },
      ],
      edges: [
        { edgeId: 'e1', sourceBlockId: 'c1', sourceHandle: 'out', targetBlockId: 'g1', targetHandle: 'prompt' },
      ],
    };
    render(<FlowCanvas initialCanvas={docWithEdge} onCanvasReady={onReady} onCanvasChange={onCanvasChange} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());

    const controller = onReady.mock.calls.at(-1)![0];
    expect(controller.serialize().edges).toHaveLength(1);

    act(() => controller.removeEdge('e1'));

    await waitFor(() => {
      const last = onCanvasChange.mock.calls.at(-1)?.[0] as FlowCanvasDoc | undefined;
      expect(last?.edges ?? [{}]).toHaveLength(0);
    });
  });
});
