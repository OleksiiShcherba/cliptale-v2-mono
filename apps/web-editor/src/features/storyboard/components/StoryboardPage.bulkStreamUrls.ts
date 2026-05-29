import { useMemo } from 'react';
import type { Node } from '@xyflow/react';

import type { UseStoryboardIllustrationsResult } from '@/features/storyboard/hooks/useStoryboardIllustrations';
import type { SceneBlockNodeData } from '@/features/storyboard/types';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';

interface StoryboardBulkStreamUrlState {
  fileIds: string[];
  urls: Record<string, string>;
  error: string | null;
  missingFileIds: string[];
}

export function useStoryboardPageBulkStreamUrls(
  nodes: Node[],
  illustrationGeneration: Pick<UseStoryboardIllustrationsResult, 'items' | 'reference'>,
): StoryboardBulkStreamUrlState {
  const fileIds = useMemo(() => {
    const ids = new Set<string>();
    nodes.forEach((node) => {
      if (node.type !== 'scene-block') return;
      const data = node.data as SceneBlockNodeData;
      (data.block?.mediaItems ?? []).forEach((item) => {
        if (item.mediaType === 'image') ids.add(item.fileId);
      });
      if (data.illustration?.outputFileId) ids.add(data.illustration.outputFileId);
    });
    illustrationGeneration.items.forEach((item) => {
      if (item.outputFileId) ids.add(item.outputFileId);
    });
    if (illustrationGeneration.reference?.outputFileId) {
      ids.add(illustrationGeneration.reference.outputFileId);
    }
    illustrationGeneration.reference?.sourceReferenceFileIds.forEach((fileId) => ids.add(fileId));
    return [...ids];
  }, [illustrationGeneration.items, illustrationGeneration.reference, nodes]);

  const { urls, error, missingFileIds } = useBulkFileStreamUrls(fileIds);
  return { fileIds, urls, error, missingFileIds };
}
