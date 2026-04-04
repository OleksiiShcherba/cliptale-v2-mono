import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import { useEphemeralStore, setPxPerFrame, setScrollOffsetX } from '@/store/ephemeral-store';
import { useProjectStore } from '@/store/project-store';

import { TimelineRuler } from './TimelineRuler';
import { TrackList, TRACK_HEADER_WIDTH } from './TrackList';
import { useClipDrag } from '../hooks/useClipDrag';
import { useClipTrim } from '../hooks/useClipTrim';

// Design tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_SECONDARY = '#8A8AA0';

/** Fixed height of the entire timeline panel in pixels. */
const TIMELINE_PANEL_HEIGHT = 232;

/** Height of the ruler strip. */
const RULER_HEIGHT = 28;

/** Height of the toolbar strip above the ruler. */
const TOOLBAR_HEIGHT = 32;

/** Height available for the scrollable track list. */
const TRACK_LIST_HEIGHT = TIMELINE_PANEL_HEIGHT - TOOLBAR_HEIGHT - RULER_HEIGHT;

interface TimelinePanelProps {
  /** Called when a track name is edited. */
  onRenameTrack: (trackId: string, newName: string) => void;
  /** Called when mute is toggled. */
  onToggleMute: (trackId: string) => void;
  /** Called when lock is toggled. */
  onToggleLock: (trackId: string) => void;
}

/**
 * Full-width timeline panel rendered at the bottom of the editor.
 * Composes `TimelineRuler` and `TrackList` and synchronises their
 * horizontal scroll position so they scroll as one unit.
 *
 * Zoom is read from and written to the ephemeral store via `pxPerFrame`.
 * Clip drag is managed by `useClipDrag` and trim by `useClipTrim`;
 * both are passed through to `TrackList`.
 */
export function TimelinePanel({
  onRenameTrack,
  onToggleMute,
  onToggleLock,
}: TimelinePanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(800);

  const { pxPerFrame, scrollOffsetX, selectedClipIds } = useEphemeralStore();
  const project = useProjectStore();

  const tracks: Track[] = project.tracks ?? [];
  const clips: ReadonlyArray<Clip & { layer?: number }> = (project.clips ?? []) as ReadonlyArray<Clip & { layer?: number }>;
  const fps: number = project.fps ?? 30;
  const durationFrames: number = project.durationFrames ?? 300;
  const projectId: string = project.id;

  // Convert selectedClipIds array to a Set for O(1) lookup in ClipBlock.
  const selectedClipIdSet = useMemo(
    () => new Set(selectedClipIds),
    [selectedClipIds],
  );

  // Clip drag hook — manages ghost positions and fires PATCH on drop.
  const { dragInfo, onClipPointerDown } = useClipDrag(projectId);

  // Clip trim hook — manages edge resize and fires PATCH on drop.
  const { trimInfo, getTrimCursor, onTrimPointerDown } = useClipTrim(projectId);

  // Observe panel width changes so ruler and track list stay in sync.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setPanelWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setPanelWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  const laneWidth = Math.max(0, panelWidth - TRACK_HEADER_WIDTH);

  const handleZoomIn = useCallback(() => setPxPerFrame(pxPerFrame * 1.25), [pxPerFrame]);
  const handleZoomOut = useCallback(() => setPxPerFrame(pxPerFrame / 1.25), [pxPerFrame]);

  /** Horizontal scroll wheel on the track lane area. */
  const handleLaneWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      setScrollOffsetX(scrollOffsetX + e.deltaX + e.deltaY);
    },
    [scrollOffsetX],
  );

  return (
    <div ref={panelRef} style={styles.panel} aria-label="Timeline">
      {/* Toolbar row */}
      <div style={styles.toolbar} role="toolbar" aria-label="Timeline toolbar">
        <button
          onClick={handleZoomOut}
          aria-label="Zoom out timeline"
          style={styles.toolbarButton}
          title="Zoom out"
        >
          −
        </button>
        <span style={styles.zoomLabel} aria-live="polite">
          {pxPerFrame.toFixed(1)} px/f
        </span>
        <button
          onClick={handleZoomIn}
          aria-label="Zoom in timeline"
          style={styles.toolbarButton}
          title="Zoom in"
        >
          +
        </button>
        <span style={styles.trackCount}>
          {tracks.length} track{tracks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Ruler row — offset by header width so it aligns with the clip lane */}
      <div style={styles.rulerRow}>
        <div style={{ width: TRACK_HEADER_WIDTH, flexShrink: 0 }} aria-hidden="true" />
        <div style={styles.rulerWrapper} onWheel={handleLaneWheel}>
          <TimelineRuler
            durationFrames={durationFrames}
            pxPerFrame={pxPerFrame}
            fps={fps}
            scrollOffsetX={scrollOffsetX}
            width={laneWidth}
          />
        </div>
      </div>

      {/* Track list */}
      <div style={styles.trackListWrapper} onWheel={handleLaneWheel}>
        <TrackList
          tracks={tracks}
          clips={clips}
          pxPerFrame={pxPerFrame}
          selectedClipIds={selectedClipIdSet}
          laneWidth={laneWidth}
          height={TRACK_LIST_HEIGHT}
          dragInfo={dragInfo}
          onClipPointerDown={onClipPointerDown}
          trimInfo={trimInfo}
          getTrimCursor={getTrimCursor}
          onTrimPointerDown={onTrimPointerDown}
          onRename={onRenameTrack}
          onToggleMute={onToggleMute}
          onToggleLock={onToggleLock}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    height: TIMELINE_PANEL_HEIGHT,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#0D0D14',
    borderTop: `1px solid ${BORDER}`,
    overflow: 'hidden',
  },
  toolbar: {
    height: TOOLBAR_HEIGHT,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    flexShrink: 0,
  },
  toolbarButton: {
    width: 24,
    height: 24,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: '#F0F0FA',
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  },
  zoomLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
    minWidth: 48,
    textAlign: 'center',
  },
  trackCount: {
    marginLeft: 'auto',
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
  },
  rulerRow: {
    display: 'flex',
    flexShrink: 0,
    background: '#0D0D14',
    borderBottom: `1px solid ${BORDER}`,
  },
  rulerWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  trackListWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
};
