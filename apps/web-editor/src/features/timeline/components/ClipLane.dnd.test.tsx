import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { ClipLane } from './ClipLane';
import { defaultProps, makeAsset } from './ClipLane.fixtures';

vi.mock('../api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
}));

describe('ClipLane — asset drag-and-drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onAssetDrop with the correct asset when an asset is dropped on the lane', () => {
    const onAssetDrop = vi.fn();
    const { container } = render(
      <ClipLane {...defaultProps} onAssetDrop={onAssetDrop} scrollOffsetX={0} pxPerFrame={4} />,
    );
    const lane = container.firstChild as HTMLElement;

    const dataTransfer = {
      types: ['application/cliptale-asset'],
      getData: (_: string) => JSON.stringify(makeAsset()),
      dropEffect: 'none' as DataTransfer['dropEffect'],
    };

    fireEvent.dragOver(lane, { dataTransfer });
    // JSDOM doesn't expose clientX on DragEvents — only verify asset parsing.
    fireEvent.drop(lane, { dataTransfer });

    expect(onAssetDrop).toHaveBeenCalledOnce();
    expect(onAssetDrop.mock.calls[0]![0]).toMatchObject({ id: 'asset-001', contentType: 'video/mp4' });
  });

  it('does not call onAssetDrop when dragged data is not cliptale-asset type', () => {
    const onAssetDrop = vi.fn();
    const { container } = render(<ClipLane {...defaultProps} onAssetDrop={onAssetDrop} />);
    const lane = container.firstChild as HTMLElement;

    const dataTransfer = {
      types: ['text/plain'],
      getData: (_: string) => '',
      dropEffect: 'none' as DataTransfer['dropEffect'],
    };

    fireEvent.dragOver(lane, { dataTransfer });
    fireEvent.drop(lane, { dataTransfer });

    expect(onAssetDrop).not.toHaveBeenCalled();
  });

  it('shows drop target overlay when asset drag is over the lane', () => {
    const { container } = render(<ClipLane {...defaultProps} onAssetDrop={vi.fn()} />);
    const lane = container.firstChild as HTMLElement;

    fireEvent.dragOver(lane, {
      dataTransfer: {
        types: ['application/cliptale-asset'],
        dropEffect: 'none' as DataTransfer['dropEffect'],
      },
    });

    const overlay = container.querySelector('[style*="dashed"]') as HTMLElement | null;
    expect(overlay).not.toBeNull();
  });

  it('removes drop target overlay when drag leaves the lane', () => {
    const { container } = render(<ClipLane {...defaultProps} onAssetDrop={vi.fn()} />);
    const lane = container.firstChild as HTMLElement;

    fireEvent.dragOver(lane, {
      dataTransfer: {
        types: ['application/cliptale-asset'],
        dropEffect: 'none' as DataTransfer['dropEffect'],
      },
    });
    fireEvent.dragLeave(lane);

    const overlay = container.querySelector('[style*="dashed"]') as HTMLElement | null;
    expect(overlay).toBeNull();
  });
});
