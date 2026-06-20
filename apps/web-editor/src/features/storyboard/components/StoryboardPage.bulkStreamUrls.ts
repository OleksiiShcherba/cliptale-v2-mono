import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

import type { StoryboardIllustrationStatusItem, SceneBlockNodeData } from '@/features/storyboard/types';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';

interface StoryboardBulkStreamUrlState {
  fileIds: string[];
  urls: Record<string, string>;
  error: string | null;
  missingFileIds: string[];
}

export function useStoryboardPageBulkStreamUrls(
  nodes: Node[],
  illustrationGeneration: { items: StoryboardIllustrationStatusItem[] },
): StoryboardBulkStreamUrlState {
  const fileIds = useMemo(() => {
    const ids = new Set<string>();
    nodes.forEach((node) => {
      if (node.type !== 'scene-block') return;
      const data = node.data as SceneBlockNodeData;
      (data.block?.mediaItems ?? []).forEach((item) => {
        if (item.mediaType === 'image' && item.fileId) ids.add(item.fileId);
      });
      if (data.illustration?.outputFileId) ids.add(data.illustration.outputFileId);
    });
    illustrationGeneration.items.forEach((item) => {
      if (item.outputFileId) ids.add(item.outputFileId);
    });
    return [...ids];
  }, [illustrationGeneration.items, nodes]);

  const { urls, error, missingFileIds } = useBulkFileStreamUrls(fileIds);
  return { fileIds, urls, error, missingFileIds };
}
