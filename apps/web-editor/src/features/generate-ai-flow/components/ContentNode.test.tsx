/**
 * ContentNode — media preview rendering.
 *
 * An image (and other media) content block with a selected asset shows a large
 * preview on the node, not just an "Asset selected" label. The preview URL is
 * resolved from the fileId via useFileStreamUrl (mocked here). Handles need a
 * ReactFlowProvider to mount.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

// Resolve any fileId to a deterministic URL so the preview <img> has a src.
vi.mock('@/shared/hooks/useFileStreamUrl', () => ({
  useFileStreamUrl: (fileId: string | null) => ({
    url: fileId ? `https://cdn.test/${fileId}.bin` : null,
    isLoading: false,
    error: null,
  }),
}));

import { ContentNode } from './ContentNode';

function renderNode(params: Record<string, unknown>, selected = false) {
  const props = {
    id: 'c1',
    data: { block: { blockId: 'c1', type: 'content', position: { x: 0, y: 0 }, params } },
    type: 'content',
    selected,
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
      <ContentNode {...props} />
    </ReactFlowProvider>,
  );
}

describe('ContentNode — media preview', () => {
  it('renders a large image preview for an image block with a fileId', () => {
    renderNode({ contentType: 'asset', modality: 'image', fileId: 'img-9' });
    const img = screen.getByTestId('content-media-image') as HTMLImageElement;
    expect(img.src).toContain('img-9');
  });

  it('renders a video preview for a video block with a fileId', () => {
    renderNode({ contentType: 'asset', modality: 'video', fileId: 'vid-3' });
    expect(screen.getByTestId('content-media-video')).toBeDefined();
  });

  it('shows "No asset selected" for an image block with no fileId', () => {
    renderNode({ contentType: 'asset', modality: 'image', fileId: '' });
    expect(screen.getByText(/no asset selected/i)).toBeDefined();
    expect(screen.queryByTestId('content-media-image')).toBeNull();
  });

  it('keeps the text preview for a text block', () => {
    renderNode({ contentType: 'text', modality: 'text', text: 'hello there' });
    expect(screen.getByText(/hello there/)).toBeDefined();
    expect(screen.queryByTestId('content-media-image')).toBeNull();
  });

  it('renders a selected outline when the node is selected', () => {
    renderNode({ contentType: 'text', modality: 'text', text: 'x' }, true);
    const root = screen.getByTestId('content-node') as HTMLElement;
    expect(root.style.boxShadow).not.toBe('');
  });

  it('has no selected outline when not selected', () => {
    renderNode({ contentType: 'text', modality: 'text', text: 'x' }, false);
    const root = screen.getByTestId('content-node') as HTMLElement;
    expect(root.style.boxShadow).toBe('');
  });
});
