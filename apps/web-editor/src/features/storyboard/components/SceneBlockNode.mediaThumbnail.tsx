import React from 'react';

import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import type { BlockMediaItem } from '../types';
import { sceneBlockNodeStyles as s } from './nodeStyles';

const VISUAL_MEDIA_TYPES = new Set<string>(['image', 'video']);

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
  const { url: imageUrl } = useFileStreamUrl(fileId);

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
