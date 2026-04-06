import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DragEvent } from 'react';

import { useAssetDrop } from './useAssetDrop';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset() {
  return {
    id: 'asset-001',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    status: 'ready' as const,
    durationSeconds: 5,
    thumbnailUri: null,
    createdAt: '',
  };
}

/**
 * Creates a synthetic DragEvent-like object suitable for calling the hook handlers.
 * JSDOM does not properly support DragEvent.clientX, so we build a plain object
 * with the subset of properties the hook actually reads.
 */
function makeDropEvent(overrides: {
  types?: string[];
  jsonData?: string;
  clientX?: number;
  boundingLeft?: number;
  preventDefault?: () => void;
}): DragEvent {
  const { types = [], jsonData = '', clientX = 0, boundingLeft = 0, preventDefault = vi.fn() } = overrides;
  const el = {
    getBoundingClientRect: () => ({ left: boundingLeft }),
  };
  return {
    preventDefault,
    dataTransfer: {
      types,
      getData: (_: string) => jsonData,
      dropEffect: 'none',
    },
    currentTarget: el,
    clientX,
  } as unknown as DragEvent;
}

function makeDragOverEvent(types: string[] = ['application/cliptale-asset']): DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      types,
      get dropEffect() { return 'none'; },
      set dropEffect(_val: string) { /* noop */ },
    },
  } as unknown as DragEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAssetDrop', () => {
  describe('handleDragOver', () => {
    it('calls preventDefault and sets isAssetDragOver when MIME type matches', () => {
      const onAssetDrop = vi.fn();
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 0, 4));

      act(() => {
        result.current.handleDragOver(makeDragOverEvent(['application/cliptale-asset']));
      });

      expect(result.current.isAssetDragOver).toBe(true);
    });

    it('does NOT set isAssetDragOver when MIME type is absent', () => {
      const { result } = renderHook(() => useAssetDrop(undefined, 0, 4));

      act(() => {
        result.current.handleDragOver(makeDragOverEvent(['text/plain']));
      });

      expect(result.current.isAssetDragOver).toBe(false);
    });
  });

  describe('handleDragLeave', () => {
    it('clears isAssetDragOver', () => {
      const { result } = renderHook(() => useAssetDrop(vi.fn(), 0, 4));

      act(() => {
        result.current.handleDragOver(makeDragOverEvent());
      });
      expect(result.current.isAssetDragOver).toBe(true);

      act(() => {
        result.current.handleDragLeave();
      });
      expect(result.current.isAssetDragOver).toBe(false);
    });
  });

  describe('handleDrop', () => {
    it('calls onAssetDrop with the parsed asset and computed startFrame', () => {
      const onAssetDrop = vi.fn();
      // pxPerFrame=4, boundingLeft=20, clientX=60, scrollOffsetX=0
      // relativeX = 60 - 20 + 0 = 40; startFrame = round(40/4) = 10
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 0, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: JSON.stringify(makeAsset()),
        clientX: 60,
        boundingLeft: 20,
      });

      act(() => {
        result.current.handleDrop(evt);
      });

      expect(onAssetDrop).toHaveBeenCalledOnce();
      expect(onAssetDrop.mock.calls[0]![0]).toMatchObject({ id: 'asset-001' });
      expect(onAssetDrop.mock.calls[0]![1]).toBe(10);
    });

    it('accounts for scrollOffsetX when computing startFrame', () => {
      const onAssetDrop = vi.fn();
      // pxPerFrame=4, boundingLeft=0, clientX=40, scrollOffsetX=20
      // relativeX = 40 - 0 + 20 = 60; startFrame = round(60/4) = 15
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 20, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: JSON.stringify(makeAsset()),
        clientX: 40,
        boundingLeft: 0,
      });

      act(() => {
        result.current.handleDrop(evt);
      });

      expect(onAssetDrop.mock.calls[0]![1]).toBe(15);
    });

    it('clamps startFrame to 0 when computed value is negative', () => {
      const onAssetDrop = vi.fn();
      // clientX=0, boundingLeft=100, scrollOffsetX=0 → relativeX = -100 → clamped to 0
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 0, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: JSON.stringify(makeAsset()),
        clientX: 0,
        boundingLeft: 100,
      });

      act(() => {
        result.current.handleDrop(evt);
      });

      expect(onAssetDrop.mock.calls[0]![1]).toBe(0);
    });

    it('does NOT call onAssetDrop when JSON data is empty', () => {
      const onAssetDrop = vi.fn();
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 0, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: '',
      });

      act(() => {
        result.current.handleDrop(evt);
      });

      expect(onAssetDrop).not.toHaveBeenCalled();
    });

    it('does NOT call onAssetDrop when JSON is malformed', () => {
      const onAssetDrop = vi.fn();
      const { result } = renderHook(() => useAssetDrop(onAssetDrop, 0, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: 'not-valid-json{{{',
      });

      act(() => {
        result.current.handleDrop(evt);
      });

      expect(onAssetDrop).not.toHaveBeenCalled();
    });

    it('does NOT call onAssetDrop when onAssetDrop is undefined', () => {
      // Should not throw even when callback is undefined
      const { result } = renderHook(() => useAssetDrop(undefined, 0, 4));

      const evt = makeDropEvent({
        types: ['application/cliptale-asset'],
        jsonData: JSON.stringify(makeAsset()),
      });

      expect(() => {
        act(() => {
          result.current.handleDrop(evt);
        });
      }).not.toThrow();
    });

    it('clears isAssetDragOver on drop regardless of payload validity', () => {
      const { result } = renderHook(() => useAssetDrop(vi.fn(), 0, 4));

      act(() => {
        result.current.handleDragOver(makeDragOverEvent());
      });
      expect(result.current.isAssetDragOver).toBe(true);

      act(() => {
        result.current.handleDrop(makeDropEvent({ jsonData: '' }));
      });

      expect(result.current.isAssetDragOver).toBe(false);
    });
  });
});
