import { useCallback, useState } from 'react';

import type { Asset } from '@/features/asset-manager/types';

/**
 * Encapsulates HTML5 drag-and-drop handlers for accepting asset drops onto a
 * ClipLane. The caller is responsible for attaching the returned event handlers
 * to the lane element and forwarding `onAssetDrop` with the resolved asset and
 * start frame.
 */
export function useAssetDrop(
  onAssetDrop: ((asset: Asset, startFrame: number) => void) | undefined,
  scrollOffsetX: number,
  pxPerFrame: number,
): {
  isAssetDragOver: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => void;
} {
  const [isAssetDragOver, setIsAssetDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/cliptale-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsAssetDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsAssetDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsAssetDragOver(false);
      if (!onAssetDrop) return;

      const assetJson = e.dataTransfer.getData('application/cliptale-asset');
      if (!assetJson) return;

      let asset: Asset;
      try {
        asset = JSON.parse(assetJson) as Asset;
      } catch {
        return;
      }

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relativeX = e.clientX - rect.left + scrollOffsetX;
      const startFrame = Math.max(0, Math.round(relativeX / pxPerFrame));

      onAssetDrop(asset, startFrame);
    },
    [onAssetDrop, scrollOffsetX, pxPerFrame],
  );

  return { isAssetDragOver, handleDragOver, handleDragLeave, handleDrop };
}
