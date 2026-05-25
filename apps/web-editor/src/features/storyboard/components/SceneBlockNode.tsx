/**
 * SceneBlockNode — React Flow custom node for a SCENE block.
 *
 * Renders:
 * - Scene name (auto "SCENE 01" if blank) in the header
 * - Red × button (top-right) to remove the node from canvas state
 * - Prompt preview (first 80 chars, truncated with "…")
 * - Duration badge
 * - Up to 3 media thumbnail previews
 *   (placeholder SVG if no image/video items; audio shows placeholder)
 * - Media type badges (IMAGE CLIP / VIDEO CLIP / AUDIO CLIP) per unique type
 * - Income port (left) and exit port (right) — both visible on hover
 */

import React, { useCallback } from 'react';

import { Handle, Position } from '@xyflow/react';

import type { SceneBlockNodeData } from '../types';
import { MediaThumbnail, PlaceholderThumbnail } from './SceneBlockNode.mediaThumbnail';
import {
  ERROR,
  PRIMARY,
  PRIMARY_LIGHT,
  SUCCESS,
  SURFACE_ELEVATED,
  WARNING,
  sceneBlockNodeStyles as s,
} from './nodeStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

const PROMPT_MAX_CHARS = 80;
const MAX_THUMBNAILS = 3;

const MEDIA_TYPE_BADGE_LABELS: Record<string, string> = {
  image: 'IMAGE CLIP',
  video: 'VIDEO CLIP',
  audio: 'AUDIO CLIP',
};

const ILLUSTRATION_STATUS_LABELS = {
  queued: 'Image queued',
  running: 'Image running',
  ready: 'Image ready',
  failed: 'Image failed',
} as const;

const ILLUSTRATION_STATUS_COLORS = {
  queued: WARNING,
  running: PRIMARY,
  ready: SUCCESS,
  failed: ERROR,
} as const;

const LOADING_ILLUSTRATION_STATUSES = new Set(['queued', 'running']);

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
  const { block, illustration, onRemove, onEdit, onRetryIllustration } = data;

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

  const handleRetryIllustration = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      onRetryIllustration?.(id);
    },
    [id, onRetryIllustration],
  );

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

        {illustration?.jobId ? (
          <div style={s.illustrationStatusRow} data-testid="illustration-status-row">
            {LOADING_ILLUSTRATION_STATUSES.has(illustration.status) ? (
              <style>
                {'@keyframes storyboard-illustration-spin { to { transform: rotate(360deg); } }'}
              </style>
            ) : null}
            <span
              style={{
                ...s.illustrationStatusBadge,
                color: ILLUSTRATION_STATUS_COLORS[illustration.status],
                borderColor: ILLUSTRATION_STATUS_COLORS[illustration.status],
              }}
              title={illustration.errorMessage ?? ILLUSTRATION_STATUS_LABELS[illustration.status]}
              data-testid="illustration-status-badge"
            >
              {LOADING_ILLUSTRATION_STATUSES.has(illustration.status) ? (
                <>
                  <span
                    style={s.illustrationStatusSpinner}
                    aria-hidden="true"
                    data-testid="illustration-status-loader"
                  />
                </>
              ) : null}
              {ILLUSTRATION_STATUS_LABELS[illustration.status]}
            </span>
            {illustration.status === 'failed' ? (
              <button
                type="button"
                style={s.illustrationRetryButton}
                onClick={handleRetryIllustration}
                data-testid="illustration-retry-button"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

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
