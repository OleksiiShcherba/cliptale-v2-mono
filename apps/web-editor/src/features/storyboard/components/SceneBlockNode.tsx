/**
 * SceneBlockNode — React Flow custom node for a SCENE block.
 *
 * Renders:
 * - Scene name (auto "SCENE 01" if blank) in the header
 * - Red × button (top-right) to remove the node from canvas state
 * - Prompt preview (first 80 chars, truncated with "…")
 * - Duration badge
 * - Up to 3 media thumbnail previews (placeholder SVG if none)
 * - Media type badges per thumbnail
 * - Income port (left) and exit port (right) — both visible on hover
 */

import React, { useCallback } from 'react';

import { Handle, Position } from '@xyflow/react';

import type { SceneBlockNodeData } from '../types';
import { PRIMARY_LIGHT, SURFACE_ELEVATED, sceneBlockNodeStyles as s } from './nodeStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

const PROMPT_MAX_CHARS = 80;
const MAX_THUMBNAILS = 3;

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

/** Placeholder SVG shown when a thumbnail slot has no media. */
function PlaceholderThumbnail(): React.ReactElement {
  return (
    <div style={s.thumbnailPlaceholder} aria-label="No media">
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

/** Red × remove button. */
function RemoveButton({ onClick }: { onClick: () => void }): React.ReactElement {
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
 * The red × button removes the node from React Flow state via `onRemove` callback.
 * No API call is made at this stage — wired to autosave in subtask 8.
 */
export function SceneBlockNode({ id, data }: SceneBlockNodeProps): React.ReactElement {
  const { block, onRemove } = data;

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

  // Collect unique media types for badge display.
  const mediaTypes = Array.from(
    new Set(block.mediaItems.slice(0, MAX_THUMBNAILS).map((m) => m.mediaType)),
  );

  const handleRemove = useCallback((): void => {
    onRemove(id);
  }, [id, onRemove]);

  return (
    <div style={s.root} data-testid="scene-block-node">
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

      {/* Body: prompt, duration badge, thumbnails */}
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
                <PlaceholderThumbnail />
                <span style={s.mediaTypeBadge}>{item.mediaType}</span>
              </div>
            ))
          )}
        </div>

        {/* Media type badges */}
        {mediaTypes.length > 0 ? (
          <div style={s.mediaTypeRow} data-testid="media-type-row">
            {mediaTypes.map((type) => (
              <span key={type} style={s.mediaTypeBadge} data-testid="media-type-badge">
                {type}
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
