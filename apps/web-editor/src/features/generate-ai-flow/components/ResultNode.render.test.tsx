/**
 * ResultNode — progress / dominant preview / failed+retry (T20 / AC-08, AC-09, AC-12, AC-13).
 *
 * The result node renders, from its node data's job state:
 *   - running  → live progress (AC-08)
 *   - done     → the DOMINANT media preview: image=<img>, video=<video>, audio=<audio> (AC-08/12/13)
 *   - failed   → the reason + a Retry button (AC-09)
 *
 * useJobPolling is NOT used here — the node receives a resolved job via node data
 * (the hook lives in useFlowGeneration). Handles need a ReactFlowProvider to mount.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

import { ResultNode } from './ResultNode';
import type { ResultNodeData } from './ResultNode';

function renderNode(data: Partial<ResultNodeData>) {
  const props = {
    id: 'r1',
    data: {
      block: { blockId: 'r1', type: 'result', position: { x: 0, y: 0 }, params: { sourceBlockId: 'g1' } },
      ...data,
    },
    type: 'result',
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
      <ResultNode {...props} />
    </ReactFlowProvider>,
  );
}

describe('ResultNode — running progress (AC-08)', () => {
  it('shows live progress while running', () => {
    renderNode({
      modality: 'image',
      job: { jobId: 'j1', status: 'processing', progress: 65, resultAssetId: null, errorMessage: null },
    });
    expect(screen.getByTestId('result-progress')).toBeDefined();
    expect(screen.getByText(/65/)).toBeDefined();
  });
});

describe('ResultNode — dominant media preview (AC-08/12/13)', () => {
  it('renders a large IMAGE preview on completion', () => {
    renderNode({
      modality: 'image',
      previewUrl: 'https://cdn/x.png',
      job: { jobId: 'j1', status: 'completed', progress: 100, resultAssetId: 'file-1', errorMessage: null },
    });
    const img = screen.getByTestId('result-media-image');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toContain('https://cdn/x.png');
  });

  it('renders a VIDEO player on completion', () => {
    renderNode({
      modality: 'video',
      previewUrl: 'https://cdn/x.mp4',
      job: { jobId: 'j1', status: 'completed', progress: 100, resultAssetId: 'file-2', errorMessage: null },
    });
    expect(screen.getByTestId('result-media-video')).toBeDefined();
  });

  it('renders an AUDIO player on completion', () => {
    renderNode({
      modality: 'audio',
      previewUrl: 'https://cdn/x.mp3',
      job: { jobId: 'j1', status: 'completed', progress: 100, resultAssetId: 'file-3', errorMessage: null },
    });
    expect(screen.getByTestId('result-media-audio')).toBeDefined();
  });
});

describe('ResultNode — failed + retry (AC-09)', () => {
  it('shows the failure reason and a retry button', () => {
    const onRetry = vi.fn();
    renderNode({
      modality: 'image',
      job: { jobId: 'j1', status: 'failed', progress: 0, resultAssetId: null, errorMessage: 'provider exploded' },
      onRetry,
    });
    expect(screen.getByText(/provider exploded/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ResultNode — no job yet', () => {
  it('shows the placeholder when there is no job', () => {
    renderNode({ modality: 'image' });
    expect(screen.getByText(/no result yet/i)).toBeDefined();
  });
});
