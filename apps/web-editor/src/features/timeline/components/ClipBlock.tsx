import React, { useCallback, useRef } from 'react';

import type { Clip } from '@ai-video-editor/project-schema';

import { WaveformSvg } from './WaveformSvg.js';

// Design tokens
const CLIP_COLORS: Record<Clip['type'], string> = {
  video:          '#7C3AED',
  audio:          '#4C1D95',
  'text-overlay': '#F59E0B',
  image:          '#0EA5E9',
  caption:        '#10B981',
};

const CLIP_SELECTED_BORDER_COLOR = '#F0F0FA';
const CLIP_DEFAULT_BORDER_COLOR  = 'transparent';
const CLIP_TEXT_COLOR            = '#F0F0FA';
const CLIP_LOCKED_OPACITY        = 0.5;
const CLIP_DRAGGING_OPACITY      = 0.5;

/** Vertical pixels offset per layer value (for same-layer overlap indicator). */
const LAYER_OFFSET_PX = 4;

/** Asset data subset needed for clip thumbnail/waveform display. */
export type ClipAssetData = {
  thumbnailUrl: string | null;
  waveformPeaks: number[] | null;
};

interface ClipBlockProps {
  clip: Clip & { layer?: number };
  /** Pixels per frame — used to compute left and width. */
  pxPerFrame: number;
  /** Whether this clip is currently selected. */
  isSelected: boolean;
  /** Whether the parent track is locked (disables interaction). */
  isLocked: boolean;
  /** Optional asset data for thumbnail/waveform display. */
  assetData?: ClipAssetData;
  /** Height of the clip lane in pixels. */
  laneHeight: number;
  /**
   * Horizontal scroll offset of the clip lane in pixels.
   * Subtracted from the computed left position so clip blocks scroll
   * in sync with the ruler.
   */
  scrollOffsetX: number;
  /** Called when the clip is clicked (adds to selection). */
  onClick: (clipId: string, shiftKey: boolean) => void;
  /**
   * Called on pointerdown to initiate a drag operation.
   * If omitted, dragging is disabled on this block.
   * Returns whether a trim (not a drag) was initiated.
   */
  onPointerDown?: (e: React.PointerEvent, clipId: string, isLocked: boolean) => void;
  /**
   * Called on right-click to open the context menu.
   * Receives the clip ID and the screen coordinates.
   */
  onContextMenu?: (e: React.MouseEvent, clipId: string) => void;
  /**
   * Override the left position (pixels) during a drag or trim operation.
   * When set, this is used instead of `clip.startFrame * pxPerFrame`.
   * The scroll offset is still subtracted from this value.
   */
  ghostLeft?: number;
  /**
   * Override the width (pixels) during a trim operation.
   * When set, this is used instead of `clip.durationFrames * pxPerFrame`.
   */
  ghostWidth?: number;
  /**
   * When true the clip is rendered at 50% opacity to indicate it is being
   * dragged (the ghost is shown elsewhere at full opacity).
   */
  isDragging?: boolean;
  /**
   * Callback from the trim hook — detects edge proximity and returns the
   * cursor string to apply. Called on every mouse-move over the block.
   */
  getTrimCursor?: (
    e: React.MouseEvent,
    clipId: string,
    clipWidth: number,
    isLocked: boolean,
  ) => 'ew-resize' | null;
}

/** Returns a short human-readable label for the clip block. */
function getClipLabel(clip: Clip): string {
  if (clip.type === 'caption') {
    const text = clip.words.map((w) => w.word).join(' ');
    return text.length > 40 ? `${text.slice(0, 40)}…` : text || 'caption';
  }
  return clip.type;
}

/**
 * Renders a single clip as an absolutely-positioned block inside its `ClipLane`.
 * Position and width are derived from `clip.startFrame * pxPerFrame` and
 * `clip.durationFrames * pxPerFrame`.
 *
 * Selected clips render with a highlighted border using the design system token.
 * Video clips show a thumbnail; audio clips show a waveform SVG.
 * Clips with a `layer` > 0 are offset vertically to indicate overlap.
 *
 * During a drag operation:
 * - The original clip block is dimmed (`isDragging=true`, 50% opacity).
 * - A ghost block is rendered at the projected new position (`ghostLeft` set).
 *
 * Trim handles: hovering within 8px of the left or right edge changes the cursor
 * to `ew-resize` (provided `getTrimCursor` is passed from the trim hook).
 */
export function ClipBlock({
  clip,
  pxPerFrame,
  isSelected,
  isLocked,
  assetData,
  laneHeight,
  scrollOffsetX,
  onClick,
  onPointerDown,
  onContextMenu,
  ghostLeft,
  ghostWidth,
  isDragging = false,
  getTrimCursor,
}: ClipBlockProps): React.ReactElement {
  const left = (ghostLeft !== undefined ? ghostLeft : clip.startFrame * pxPerFrame) - scrollOffsetX;
  const width = ghostWidth !== undefined ? ghostWidth : Math.max(2, clip.durationFrames * pxPerFrame);
  const layer = clip.layer ?? 0;

  // Track computed cursor so mousemove can update it without a re-render.
  const cursorRef = useRef<React.CSSProperties['cursor']>(isLocked ? 'not-allowed' : 'grab');

  // Vertical offset for overlap indicator: each additional layer shifts down.
  const verticalOffset = layer * LAYER_OFFSET_PX;
  const blockHeight = laneHeight - verticalOffset;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isLocked) {
        onClick(clip.id, e.shiftKey);
      }
    },
    [clip.id, isLocked, onClick],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (onPointerDown) {
        onPointerDown(e, clip.id, isLocked);
      }
    },
    [clip.id, isLocked, onPointerDown],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onContextMenu) {
        onContextMenu(e, clip.id);
      }
    },
    [clip.id, onContextMenu],
  );

  /** Update cursor inline on mouse-move to avoid re-render on every pixel. */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isLocked || !getTrimCursor) return;
      const trimCursor = getTrimCursor(e, clip.id, width, isLocked);
      const newCursor = trimCursor ?? 'grab';
      if (cursorRef.current !== newCursor) {
        cursorRef.current = newCursor;
        // Direct DOM mutation avoids React re-render on every pixel.
        (e.currentTarget as HTMLDivElement).style.cursor = newCursor;
      }
    },
    [clip.id, getTrimCursor, isLocked, width],
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLocked) {
        cursorRef.current = 'grab';
        (e.currentTarget as HTMLDivElement).style.cursor = 'grab';
      }
    },
    [isLocked],
  );

  const isVideoClip = clip.type === 'video';
  const isAudioClip = clip.type === 'audio';
  const hasThumbnail = isVideoClip && assetData?.thumbnailUrl;
  const hasWaveform  = isAudioClip && assetData?.waveformPeaks && assetData.waveformPeaks.length > 0;

  const bgColor = CLIP_COLORS[clip.type] ?? '#7C3AED';

  // Compute effective opacity: locked > dragging > normal (0.75 per design spec).
  let opacity = 0.75;
  if (isLocked) opacity = CLIP_LOCKED_OPACITY;
  else if (isDragging) opacity = CLIP_DRAGGING_OPACITY;

  return (
    <div
      style={{
        ...styles.block,
        left,
        width,
        top: verticalOffset,
        height: blockHeight,
        background: bgColor,
        border: `2px solid ${isSelected ? CLIP_SELECTED_BORDER_COLOR : CLIP_DEFAULT_BORDER_COLOR}`,
        opacity,
        cursor: isLocked ? 'not-allowed' : 'grab',
      }}
      role="button"
      aria-label={`Clip: ${clip.type}, starts at frame ${clip.startFrame}`}
      aria-pressed={isSelected}
      tabIndex={0}
      onClick={handleClick}
      onPointerDown={onPointerDown ? handlePointerDown : undefined}
      onContextMenu={onContextMenu ? handleContextMenu : undefined}
      onMouseMove={getTrimCursor ? handleMouseMove : undefined}
      onMouseLeave={getTrimCursor ? handleMouseLeave : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick(e as unknown as React.MouseEvent);
      }}
      data-clip-id={clip.id}
      data-clip-type={clip.type}
    >
      {/* Thumbnail for video clips */}
      {hasThumbnail && (
        <img
          src={assetData!.thumbnailUrl!}
          alt=""
          aria-hidden="true"
          style={styles.thumbnail}
        />
      )}

      {/* Waveform SVG for audio clips */}
      {hasWaveform && (
        <WaveformSvg peaks={assetData!.waveformPeaks!} width={width} height={blockHeight} />
      )}

      {/* Clip label — always shown, sits above thumbnail/waveform */}
      <span style={styles.label}>{getClipLabel(clip)}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  block: {
    position: 'absolute',
    borderRadius: 4,
    overflow: 'hidden',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'flex-end',
    padding: '0 4px 2px',
    boxSizing: 'border-box',
  },
  thumbnail: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0.5,
    pointerEvents: 'none',
  },
  label: {
    position: 'relative',
    zIndex: 1,
    fontSize: 10,
    fontFamily: 'Inter, sans-serif',
    color: CLIP_TEXT_COLOR,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    fontWeight: 500,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: '14px',
  },
};
