import React from 'react';

import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import type { BlockMediaItem } from '../types';
import { sceneBlockNodeStyles as s } from './nodeStyles';

const VISUAL_MEDIA_TYPES = new Set<string>(['image', 'video']);
type StoryboardBulkStreamUrlContextValue = {
  urls: Record<string, string>;
  fileIds: Set<string>;
  missingFileIds: Set<string>;
  error: string | null;
};

const StoryboardBulkStreamUrlContext = React.createContext<StoryboardBulkStreamUrlContextValue>({
  urls: {},
  fileIds: new Set(),
  missingFileIds: new Set(),
  error: null,
});

export function StoryboardBulkStreamUrlProvider({
  urls,
  fileIds,
  missingFileIds,
  error = null,
  children,
}: {
  urls: Record<string, string>;
  fileIds?: readonly string[];
  missingFileIds?: readonly string[];
  error?: string | null;
  children: React.ReactNode;
}): React.ReactElement {
  const value = React.useMemo<StoryboardBulkStreamUrlContextValue>(() => ({
    urls,
    fileIds: new Set(fileIds ?? Object.keys(urls)),
    missingFileIds: new Set(missingFileIds ?? []),
    error,
  }), [error, fileIds, missingFileIds, urls]);

  return (
    <StoryboardBulkStreamUrlContext.Provider value={value}>
      {children}
    </StoryboardBulkStreamUrlContext.Provider>
  );
}

export function useStoryboardBulkStreamUrl(fileId: string | null): {
  url: string | null;
  isBulkManaged: boolean;
  isMissing: boolean;
  error: string | null;
} {
  const { urls, fileIds, missingFileIds, error } = React.useContext(StoryboardBulkStreamUrlContext);
  if (!fileId) return { url: null, isBulkManaged: false, isMissing: false, error };
  return {
    url: urls[fileId] ?? null,
    isBulkManaged: fileIds.has(fileId),
    isMissing: missingFileIds.has(fileId),
    error,
  };
}

/** Placeholder SVG shown when a thumbnail slot has no image/video media. */
export function PlaceholderThumbnail(): React.ReactElement {
  return (
    <div style={s.thumbnailPlaceholder} aria-label="No media preview">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
        data-testid="placeholder-svg"
      >
        <rect x="1" y="1" width="18" height="18" rx="3" stroke="#252535" strokeWidth="1.5" />
        <path d="M7 13l3-4 2 2.5 1.5-2 2.5 3.5H7Z" fill="#252535" />
        <circle cx="6.5" cy="6.5" r="1.5" fill="#252535" />
      </svg>
    </div>
  );
}

/** Thumbnail image loaded via the same file stream path as principal image previews. */
export function MediaThumbnail({ item }: { item: BlockMediaItem }): React.ReactElement {
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const fileId = item.mediaType === 'image' ? item.fileId : null;
  const bulkImage = useStoryboardBulkStreamUrl(fileId);
  const shouldFallbackToSingle = !bulkImage.url &&
    !bulkImage.isMissing &&
    (!bulkImage.isBulkManaged || bulkImage.error !== null);
  const { url: fallbackImageUrl } = useFileStreamUrl(shouldFallbackToSingle ? fileId : null);
  const bulkImageUrl = bulkImage.url;
  const imageUrl = bulkImageUrl ?? fallbackImageUrl;

  React.useEffect(() => {
    setPreviewFailed(false);
  }, [item.fileId, imageUrl]);

  if (!VISUAL_MEDIA_TYPES.has(item.mediaType)) {
    return <PlaceholderThumbnail />;
  }

  const thumbnailUrl = item.mediaType === 'image'
    ? imageUrl
    : buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${item.fileId}/thumbnail`);

  if (!thumbnailUrl || previewFailed) {
    return <PlaceholderThumbnail />;
  }

  return (
    <img
      src={thumbnailUrl}
      alt={`${item.mediaType} thumbnail`}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      loading="lazy"
      crossOrigin="anonymous"
      data-testid="thumbnail-img"
      onError={() => setPreviewFailed(true)}
    />
  );
}
