/**
 * SceneBlockNode — React Flow custom node for a SCENE block.
 *
 * Renders:
 * - Scene name (auto "SCENE 01" if blank) in the header
 * - Red × button (top-right) to remove the node from canvas state
 * - Prompt preview (first 80 chars, truncated with "…")
 * - Duration badge
 * - Up to 3 media thumbnail previews via buildAuthenticatedUrl()
 *   (placeholder SVG if no image/video items; audio shows placeholder)
 * - Media type badges (IMAGE CLIP / VIDEO CLIP / AUDIO CLIP) per unique type
 * - Income port (left) and exit port (right) — both visible on hover
 */

import React, { useCallback } from 'react';

import { Handle, Position } from '@xyflow/react';

import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import type { BlockMediaItem, SceneBlockNodeData } from '../types';
import { PRIMARY_LIGHT, SURFACE_ELEVATED, sceneBlockNodeStyles as s } from './nodeStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

const PROMPT_MAX_CHARS = 80;
const MAX_THUMBNAILS = 3;

/** Only image and video items provide a visual thumbnail; audio uses placeholder. */
const VISUAL_MEDIA_TYPES = new Set<string>(['image', 'video']);

const MEDIA_TYPE_BADGE_LABELS: Record<string, string> = {
  image: 'IMAGE CLIP',
  video: 'VIDEO CLIP',
  audio: 'AUDIO CLIP',
};

// ── Handle styles ──────────────────────────────────────────────────────────────

const SOURCE_HANDLE_STYLE: React.CSSProperties = {
  background: '#7C3AED',
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

const TARGET_HANDLE_STYLE: React.CSSProperties = {
  background: PRIMARY_LIGHT,
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Placeholder SVG shown when a thumbnail slot has no image/video media. */
function PlaceholderThumbnail(): React.ReactElement {
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
        <path
          d="M7 13l3-4 2 2.5 1.5-2 2.5 3.5H7Z"
          fill="#252535"
        />
        <circle cx="6.5" cy="6.5" r="1.5" fill="#252535" />
      </svg>
    </div>
  );
}

/** Thumbnail image loaded via authenticated URL. Falls back to placeholder on error. */
function MediaThumbnail({ item }: { item: BlockMediaItem }): React.ReactElement {
  const thumbnailUrl = buildAuthenticatedUrl(
    `${config.apiBaseUrl}/assets/${item.fileId}/thumbnail`,
  );

  if (!VISUAL_MEDIA_TYPES.has(item.mediaType)) {
    return <PlaceholderThumbnail />;
  }

  return (
    <img
      src={thumbnailUrl}
      alt={`${item.mediaType} thumbnail`}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      loading="lazy"
      data-testid="thumbnail-img"
      onError={(e) => {
        // On load error, hide img — parent shows placeholder via CSS fallback.
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

/** Red × remove button. */
function RemoveButton({ onClick }: { onClick: (e: React.MouseEvent) => void }): React.ReactElement {
  return (
    <button
      type="button"
      style={s.removeButton}
      onClick={onClick}
      aria-label="Remove scene block"
      title="Remove"
      data-testid="remove-block-button"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M2 2l8 8M10 2l-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SceneBlockNodeProps {
  id: string;
  data: SceneBlockNodeData;
}

/**
 * Custom React Flow node for a SCENE block.
 *
 * Clicking the card body opens SceneModal (wired via `onEdit` callback in data).
 * The red × button removes the node from canvas state via `onRemove` callback.
 */
export function SceneBlockNode({ id, data }: SceneBlockNodeProps): React.ReactElement {
  const { block, onRemove, onEdit } = data;

  // Derive display name: auto-generate "SCENE 01" style if blank.
  const displayName: string = block.name
    ? block.name
    : `SCENE ${String(block.sortOrder).padStart(2, '0')}`;

  // Truncate prompt to first 80 chars.
  const promptPreview: string = block.prompt
    ? block.prompt.length > PROMPT_MAX_CHARS
      ? `${block.prompt.slice(0, PROMPT_MAX_CHARS)}…`
      : block.prompt
    : '';

  // Take up to 3 media items for thumbnail display.
  const thumbnailItems = block.mediaItems.slice(0, MAX_THUMBNAILS);

  // Collect unique media types across ALL mediaItems for badge row.
  const uniqueMediaTypes = Array.from(new Set(block.mediaItems.map((m) => m.mediaType)));

  const handleRemove = useCallback(
    (e: React.MouseEvent): void => {
      // Stop propagation so the canvas click-to-open-modal is not triggered.
      e.stopPropagation();
      onRemove(id);
    },
    [id, onRemove],
  );

  const handleEdit = useCallback((): void => {
    if (onEdit) onEdit(id);
  }, [id, onEdit]);

  return (
    <div
      style={s.root}
      data-testid="scene-block-node"
      onClick={handleEdit}
      role="button"
      tabIndex={0}
      aria-label={`Edit scene ${displayName}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleEdit(); }}
    >
      {/* Income port — left side */}
      <Handle
        type="target"
        position={Position.Left}
        id="income"
        style={TARGET_HANDLE_STYLE}
        aria-label="Income port"
      />

      {/* Header: scene name + remove button */}
      <div style={s.header}>
        <span style={s.sceneName} title={displayName} data-testid="scene-name">
          {displayName}
        </span>
        <RemoveButton onClick={handleRemove} />
      </div>

      {/* Body: prompt, duration badge, thumbnails, media type badges */}
      <div style={s.body}>
        {promptPreview ? (
          <p style={s.promptText} data-testid="prompt-preview">
            {promptPreview}
          </p>
        ) : null}

        <span style={s.durationBadge} data-testid="duration-badge">
          {block.durationS}s
        </span>

        {/* Thumbnail row — up to 3 slots */}
        <div style={s.thumbnailRow} data-testid="thumbnail-row">
          {thumbnailItems.length === 0 ? (
            <div style={s.thumbnailItem} data-testid="thumbnail-item">
              <PlaceholderThumbnail />
            </div>
          ) : (
            thumbnailItems.map((item) => (
              <div key={item.id} style={s.thumbnailItem} data-testid="thumbnail-item">
                <MediaThumbnail item={item} />
              </div>
            ))
          )}
        </div>

        {/* Media type badges for all unique types in the block */}
        {uniqueMediaTypes.length > 0 ? (
          <div style={s.mediaTypeRow} data-testid="media-type-row">
            {uniqueMediaTypes.map((type) => (
              <span key={type} style={s.mediaTypeBadge} data-testid="media-type-badge">
                {MEDIA_TYPE_BADGE_LABELS[type] ?? type.toUpperCase()}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Exit port — right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="exit"
        style={SOURCE_HANDLE_STYLE}
        aria-label="Exit port"
      />
    </div>
  );
}
