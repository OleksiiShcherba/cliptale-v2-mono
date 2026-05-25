/**
 * GhostDragPortal — renders a disabled full-size preview of a dragged node
 * via ReactDOM.createPortal so it escapes the React Flow canvas transform.
 */

import React from 'react';
import ReactDOM from 'react-dom';

import type { GhostDragState } from '@/features/storyboard/hooks/useStoryboardDrag';
import type {
  BlockMediaItem,
  SentinelNodeData,
  StoryboardBlock,
  StoryboardIllustrationStatus,
  StoryboardIllustrationStatusItem,
} from '@/features/storyboard/types';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import { storyboardPageStyles as s } from './storyboardPageStyles';
import {
  BORDER,
  ERROR,
  PRIMARY,
  PRIMARY_LIGHT,
  SUCCESS,
  SURFACE_ELEVATED,
  TEXT_SECONDARY,
  WARNING,
  sceneBlockNodeStyles,
  sentinelNodeStyles,
} from './nodeStyles';

const PROMPT_MAX_CHARS = 80;
const MAX_THUMBNAILS = 3;
const VISUAL_MEDIA_TYPES = new Set<string>(['image', 'video']);

const MEDIA_TYPE_BADGE_LABELS: Record<string, string> = {
  image: 'IMAGE CLIP',
  video: 'VIDEO CLIP',
  audio: 'AUDIO CLIP',
};

const ILLUSTRATION_STATUS_LABELS: Record<StoryboardIllustrationStatus, string> = {
  queued: 'Image queued',
  running: 'Image running',
  ready: 'Image ready',
  failed: 'Image failed',
};

const ILLUSTRATION_STATUS_COLORS: Record<StoryboardIllustrationStatus, string> = {
  queued: WARNING,
  running: PRIMARY,
  ready: SUCCESS,
  failed: ERROR,
};

const LOADING_ILLUSTRATION_STATUSES = new Set<StoryboardIllustrationStatus>(['queued', 'running']);

const SOURCE_DOT_STYLE: React.CSSProperties = {
  position: 'absolute',
  right: '-5px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: PRIMARY,
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

const TARGET_DOT_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '-5px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: PRIMARY_LIGHT,
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

const END_TARGET_DOT_STYLE: React.CSSProperties = {
  ...TARGET_DOT_STYLE,
  background: TEXT_SECONDARY,
};

function PlaceholderThumbnail(): React.ReactElement {
  return (
    <div style={sceneBlockNodeStyles.thumbnailPlaceholder} aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="18" height="18" rx="3" stroke={BORDER} strokeWidth="1.5" />
        <path d="M7 13l3-4 2 2.5 1.5-2 2.5 3.5H7Z" fill={BORDER} />
        <circle cx="6.5" cy="6.5" r="1.5" fill={BORDER} />
      </svg>
    </div>
  );
}

function PreviewThumbnail({ item }: { item: BlockMediaItem }): React.ReactElement {
  if (!VISUAL_MEDIA_TYPES.has(item.mediaType)) {
    return <PlaceholderThumbnail />;
  }

  const previewPath = item.mediaType === 'image' ? 'stream' : 'thumbnail';

  return (
    <img
      src={buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${item.fileId}/${previewPath}`)}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      crossOrigin="anonymous"
      draggable={false}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

function SceneBlockPreview({
  block,
  illustration,
}: {
  block: StoryboardBlock;
  illustration?: StoryboardIllustrationStatusItem;
}): React.ReactElement {
  const displayName = block.name ? block.name : `SCENE ${String(block.sortOrder).padStart(2, '0')}`;
  const promptPreview = block.prompt
    ? block.prompt.length > PROMPT_MAX_CHARS
      ? `${block.prompt.slice(0, PROMPT_MAX_CHARS)}…`
      : block.prompt
    : '';
  const thumbnailItems = block.mediaItems.slice(0, MAX_THUMBNAILS);
  const uniqueMediaTypes = Array.from(new Set(block.mediaItems.map((item) => item.mediaType)));

  return (
    <div style={sceneBlockNodeStyles.root} data-testid="ghost-drag-scene-preview">
      <span style={TARGET_DOT_STYLE} aria-hidden="true" />
      <div style={sceneBlockNodeStyles.header}>
        <span style={sceneBlockNodeStyles.sceneName} title={displayName}>
          {displayName}
        </span>
        <span style={{ ...sceneBlockNodeStyles.removeButton, color: ERROR, cursor: 'default' }} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div style={sceneBlockNodeStyles.body}>
        {promptPreview ? <p style={sceneBlockNodeStyles.promptText}>{promptPreview}</p> : null}
        <span style={sceneBlockNodeStyles.durationBadge}>{block.durationS}s</span>
        {illustration?.jobId ? (
          <div style={sceneBlockNodeStyles.illustrationStatusRow}>
            {LOADING_ILLUSTRATION_STATUSES.has(illustration.status) ? (
              <style>
                {'@keyframes storyboard-illustration-spin { to { transform: rotate(360deg); } }'}
              </style>
            ) : null}
            <span
              style={{
                ...sceneBlockNodeStyles.illustrationStatusBadge,
                color: ILLUSTRATION_STATUS_COLORS[illustration.status],
                borderColor: ILLUSTRATION_STATUS_COLORS[illustration.status],
              }}
              title={illustration.errorMessage ?? ILLUSTRATION_STATUS_LABELS[illustration.status]}
            >
              {LOADING_ILLUSTRATION_STATUSES.has(illustration.status) ? (
                <span style={sceneBlockNodeStyles.illustrationStatusSpinner} aria-hidden="true" />
              ) : null}
              {ILLUSTRATION_STATUS_LABELS[illustration.status]}
            </span>
            {illustration.status === 'failed' ? (
              <span style={{ ...sceneBlockNodeStyles.illustrationRetryButton, cursor: 'default' }}>
                Retry
              </span>
            ) : null}
          </div>
        ) : null}
        <div style={sceneBlockNodeStyles.thumbnailRow}>
          {thumbnailItems.length === 0 ? (
            <div style={sceneBlockNodeStyles.thumbnailItem}>
              <PlaceholderThumbnail />
            </div>
          ) : (
            thumbnailItems.map((item) => (
              <div key={item.id} style={sceneBlockNodeStyles.thumbnailItem}>
                <PreviewThumbnail item={item} />
              </div>
            ))
          )}
        </div>
        {uniqueMediaTypes.length > 0 ? (
          <div style={sceneBlockNodeStyles.mediaTypeRow}>
            {uniqueMediaTypes.map((type) => (
              <span key={type} style={sceneBlockNodeStyles.mediaTypeBadge}>
                {MEDIA_TYPE_BADGE_LABELS[type] ?? type.toUpperCase()}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <span style={SOURCE_DOT_STYLE} aria-hidden="true" />
    </div>
  );
}

function SentinelPreview({ type, data }: { type: 'start' | 'end'; data: SentinelNodeData }): React.ReactElement {
  const rootStyle = type === 'start' ? sentinelNodeStyles.startRoot : sentinelNodeStyles.endRoot;

  return (
    <div style={rootStyle} data-testid={`ghost-drag-${type}-preview`}>
      {type === 'end' ? <span style={END_TARGET_DOT_STYLE} aria-hidden="true" /> : null}
      <span>{data.label}</span>
      {type === 'start' ? <span style={SOURCE_DOT_STYLE} aria-hidden="true" /> : null}
    </div>
  );
}

interface GhostDragPortalProps {
  dragState: GhostDragState;
}

export function GhostDragPortal({ dragState }: GhostDragPortalProps): React.ReactElement | null {
  if (dragState.clientX === 0 && dragState.clientY === 0) return null;

  const cloneStyle: React.CSSProperties = {
    ...s.ghostClone,
    left: dragState.clientX,
    top: dragState.clientY,
    width: dragState.nodeWidth,
    minHeight: dragState.nodeHeight,
  };

  const nodeType = dragState.node.type;
  const nodeData = dragState.node.data;
  const portal = (
    <div style={cloneStyle} data-testid="ghost-drag-clone" aria-hidden="true">
      {nodeType === 'scene-block' && (nodeData as { block?: StoryboardBlock }).block ? (
        <SceneBlockPreview
          block={(nodeData as { block: StoryboardBlock }).block}
          illustration={(nodeData as { illustration?: StoryboardIllustrationStatusItem }).illustration}
        />
      ) : nodeType === 'start' || nodeType === 'end' ? (
        <SentinelPreview type={nodeType} data={nodeData as SentinelNodeData} />
      ) : null}
    </div>
  );

  return ReactDOM.createPortal(portal, document.body);
}
