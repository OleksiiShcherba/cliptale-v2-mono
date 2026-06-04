/**
 * GenerationNode — component test (T17 / AC-15).
 *
 * A generation node renders one input handle per required model field, typed by the
 * catalog modality, and an image_url_list field renders as a multi-handle ("three dots")
 * input. Handles must be inside a ReactFlowProvider for @xyflow/react to mount.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

import { GenerationNode } from './GenerationNode';
import { TEXT_PRIMARY, TEXT_SECONDARY } from './flowNodeStyles';

function renderNode(modelId: string) {
  const props = {
    id: 'g1',
    data: { block: { blockId: 'g1', type: 'generation', position: { x: 0, y: 0 }, params: { modelId } } },
    type: 'generation',
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  } as unknown as NodeProps;
  return render(
    <ReactFlowProvider>
      <GenerationNode {...props} />
    </ReactFlowProvider>,
  );
}

describe('GenerationNode typed handles', () => {
  it('renders an image handle and a text handle for an image-to-video model', () => {
    renderNode('fal-ai/ltx-2-19b/image-to-video');
    expect(screen.getByTestId('handle-image_url')).toBeDefined();
    expect(screen.getByTestId('handle-prompt')).toBeDefined();
    expect(screen.getByTestId('handle-image_url').getAttribute('data-modality')).toBe('image');
    expect(screen.getByTestId('handle-prompt').getAttribute('data-modality')).toBe('text');
  });

  it('renders a multi/three-dots handle for an image_url_list field', () => {
    renderNode('fal-ai/nano-banana-2/edit');
    const list = screen.getByTestId('handle-image_urls');
    expect(list.getAttribute('data-list')).toBe('true');
  });

  it('renders only a text handle for a text-to-image model (no image input)', () => {
    renderNode('fal-ai/nano-banana-2');
    expect(screen.getByTestId('handle-prompt')).toBeDefined();
    expect(screen.queryByTestId('handle-image_url')).toBeNull();
  });
});

describe('GenerationNode model-label button color (U1)', () => {
  /**
   * When a model IS selected, the model-label button must use TEXT_PRIMARY (#F0F0FA)
   * so the label is readable on the dark #1E1E2E node background.
   * jsdom normalises hex inline styles to rgb().
   */
  it('uses TEXT_PRIMARY color on the model-label button when a model is selected', () => {
    renderNode('fal-ai/ltx-2-19b/image-to-video');
    const btn = screen.getByRole('button', { name: /select model/i });
    // jsdom normalises #F0F0FA → rgb(240, 240, 250)
    const expectedRgb = 'rgb(240, 240, 250)';
    expect(btn.style.color).toBe(expectedRgb);
  });

  /**
   * When NO model is selected, the placeholder must keep TEXT_SECONDARY (#8A8AA0).
   * jsdom normalises #8A8AA0 → rgb(138, 138, 160).
   */
  it('uses TEXT_SECONDARY color on the model-label button when no model is selected', () => {
    renderNode('');
    const btn = screen.getByRole('button', { name: /select model/i });
    // jsdom normalises #8A8AA0 → rgb(138, 138, 160)
    const expectedRgb = 'rgb(138, 138, 160)';
    expect(btn.style.color).toBe(expectedRgb);
  });
});
