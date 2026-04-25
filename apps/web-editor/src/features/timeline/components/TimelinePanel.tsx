import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FixedSizeList } from 'react-window';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import { useEphemeralStore, setPxPerFrame, setPlayheadFrame, setScrollOffsetX } from '@/store/ephemeral-store';
import { useProjectStore } from '@/store/project-store';
import { registerTimelinePlayheadUpdater, unregisterTimelinePlayheadUpdater, registerTrackListBounds } from '@/store/timeline-refs';

import { AddTrackMenu } from './AddTrackMenu';
import { ScrollbarStrip } from './ScrollbarStrip';
import { TimelineRuler } from './TimelineRuler';
import { TrackList, TRACK_HEADER_WIDTH } from './TrackList';
import { useClipDeleteShortcut } from '../hooks/useClipDeleteShortcut';
import { useClipDrag } from '../hooks/useClipDrag';
import { useClipTrim } from '../hooks/useClipTrim';
import { useDropAssetToTimeline, useDropAssetWithAutoTrack } from '../hooks/useDropAssetToTimeline';
import { useTimelineWheel } from '../hooks/useTimelineWheel';
import { PLAYHEAD_COLOR, TIMELINE_PANEL_HEIGHT, TOOLBAR_HEIGHT, RULER_HEIGHT, styles } from './timelinePanelStyles';
import { SCROLLBAR_HEIGHT } from './ScrollbarStrip';

/** Extra pixels scrollable past the end of the last clip. Gives dead space for
 *  dragging, adding clips, and visual breathing room. */
export const SCROLL_OVERRUN_PX = 300;

/** Props for the TimelinePanel component. */
interface TimelinePanelProps {
  /** Called when a track name is edited. */
  onRenameTrack: (trackId: string, newName: string) => void;
  /** Called when mute is toggled. */
  onToggleMute: (trackId: string) => void;
  /** Called when lock is toggled. */
  onToggleLock: (trackId: string) => void;
  /** Called when tracks are reordered via drag-and-drop. */
  onReorderTracks?: (orderedTrackIds: string[]) => void;
  /** Called when a track delete button is clicked. */
  onDeleteTrack?: (trackId: string) => void;
  /** Override panel height in pixels. Defaults to TIMELINE_PANEL_HEIGHT. Used when the panel is resizable. */
  height?: number;
}

/**
 * Full-width timeline panel at the bottom of the editor.
 * Composes `TimelineRuler`, `TrackList`, and `ScrollbarStrip`, synchronising
 * their horizontal position via the ephemeral store's `scrollOffsetX`.
 *
 * Renders a 1px playhead needle overlaid on the track lane area, positioned
 * at `playheadFrame * pxPerFrame - scrollOffsetX` from the left of the lanes.
 * The needle is hidden when it scrolls outside the visible lane bounds.
 *
 * Supports vertical scrolling of the track list via mouse wheel when hovering
 * over the track header area.
 */
export function TimelinePanel({
  onRenameTrack,
  onToggleMute,
  onToggleLock,
  onReorderTracks,
  onDeleteTrack,
  height = TIMELINE_PANEL_HEIGHT,
}: TimelinePanelProps): React.ReactElement {
  const trackListHeight = height - TOOLBAR_HEIGHT - RULER_HEIGHT - SCROLLBAR_HEIGHT;
  const panelRef = useRef<HTMLDivElement>(null);
  const rulerWrapperRef = useRef<HTMLDivElement>(null);
  const trackListWrapperRef = useRef<HTMLDivElement>(null);
  const trackListRef = useRef<FixedSizeList | null>(null);
  const [panelWidth, setPanelWidth] = useState(800);

  const { pxPerFrame, scrollOffsetX, selectedClipIds, playheadFrame } = useEphemeralStore();
  const project = useProjectStore();

  const tracks: Track[] = project.tracks ?? [];
  const clips: ReadonlyArray<Clip & { layer?: number }> = (project.clips ?? []) as ReadonlyArray<Clip & { layer?: number }>;
  const fps: number = project.fps ?? 30;
  const durationFrames: number = project.durationFrames ?? 300;
  const projectId: string = project.id;

  const selectedClipIdSet = useMemo(
    () => new Set(selectedClipIds),
    [selectedClipIds],
  );

  const { dragInfo, onClipPointerDown } = useClipDrag(projectId);
  const { trimInfo, getTrimCursor, onTrimPointerDown } = useClipTrim(projectId);
  useClipDeleteShortcut();

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

  // Register track list bounds so useClipDrag can resolve target track from pointer Y.
  useEffect(() => {
    const el = trackListWrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    registerTrackListBounds(rect.top, tracks.map(t => t.id));
  }, [tracks]);

  const handleAssetDrop = useDropAssetToTimeline(projectId);
  const handleEmptyAreaDrop = useDropAssetWithAutoTrack(projectId);

  const laneWidth = Math.max(0, panelWidth - TRACK_HEADER_WIDTH);
  const totalContentWidth = durationFrames * pxPerFrame;
  const scrollableWidth = totalContentWidth + SCROLL_OVERRUN_PX;

  const handleZoomIn = useCallback(() => setPxPerFrame(pxPerFrame * 1.25), [pxPerFrame]);
  const handleZoomOut = useCallback(() => setPxPerFrame(pxPerFrame / 1.25), [pxPerFrame]);

  // Refs to allow the wheel handler closure and rAF bridge to read current
  // layout values without stale captures.
  const scrollOffsetXRef = useRef(scrollOffsetX);
  scrollOffsetXRef.current = scrollOffsetX;
  const laneWidthRef = useRef(laneWidth);
  laneWidthRef.current = laneWidth;
  const totalContentWidthRef = useRef(scrollableWidth);
  totalContentWidthRef.current = scrollableWidth;
  const pxPerFrameRef = useRef(pxPerFrame);
  pxPerFrameRef.current = pxPerFrame;

  // Ref to the playhead needle DOM element — mutated directly by the rAF loop
  // to avoid triggering React re-renders at 60fps (architecture §7).
  const needleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    registerTimelinePlayheadUpdater((frame) => {
      const el = needleRef.current;
      if (!el) return;
      const px = frame * pxPerFrameRef.current - scrollOffsetXRef.current + TRACK_HEADER_WIDTH;
      const laneW = laneWidthRef.current;
      el.style.left = `${px}px`;
      el.style.display = px >= TRACK_HEADER_WIDTH && px <= TRACK_HEADER_WIDTH + laneW ? 'block' : 'none';
    });
    return () => unregisterTimelinePlayheadUpdater();
  }, []);

  useTimelineWheel({
    rulerWrapperRef,
    trackListWrapperRef,
    trackListRef,
    scrollOffsetXRef,
    totalContentWidthRef,
    laneWidthRef,
  });

  // Compute playhead needle position within the track list wrapper.
  // The needle left is relative to the wrapper, which starts at the left edge
  // of the header column. Add TRACK_HEADER_WIDTH so needle sits in the lane area.
  const playheadPx = playheadFrame * pxPerFrame - scrollOffsetX + TRACK_HEADER_WIDTH;
  const playheadVisible = playheadPx >= TRACK_HEADER_WIDTH && playheadPx <= TRACK_HEADER_WIDTH + laneWidth;

  return (
    <div ref={panelRef} style={{ ...styles.panel, height }} aria-label="Timeline">
      {/* Toolbar row */}
      <div style={styles.toolbar} role="toolbar" aria-label="Timeline toolbar">
        {scrollOffsetX > 0 && (
          <button
            onClick={() => setScrollOffsetX(0)}
            aria-label="Scroll to beginning"
            style={styles.toolbarButton}
            title="Scroll to beginning"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="0" y="0" width="2" height="12" rx="1" />
              <rect x="3" y="0" width="2" height="12" rx="1" />
              <path d="M11 1.134a1 1 0 0 0-1.5-.866L5 6l4.5 5.732A1 1 0 0 0 11 10.866V1.134z" />
            </svg>
          </button>
        )}
        {playheadFrame > 0 && (
          <button
            onClick={() => setPlayheadFrame(0)}
            aria-label="Return to first frame"
            style={styles.toolbarButton}
            title="Return to first frame"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="0" y="0" width="2" height="12" rx="1" />
              <path d="M11 1.134a1 1 0 0 0-1.5-.866L3 6l6.5 5.732A1 1 0 0 0 11 10.866V1.134z" />
            </svg>
          </button>
        )}
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
        <AddTrackMenu />
      </div>

      {/* Ruler row — offset by header width so it aligns with the clip lane */}
      <div style={styles.rulerRow}>
        <div style={{ width: TRACK_HEADER_WIDTH, flexShrink: 0 }} aria-hidden="true" />
        <div ref={rulerWrapperRef} style={styles.rulerWrapper}>
          <TimelineRuler
            durationFrames={durationFrames}
            pxPerFrame={pxPerFrame}
            fps={fps}
            scrollOffsetX={scrollOffsetX}
            width={laneWidth}
          />
        </div>
      </div>

      {/* Track list with absolute-positioned playhead overlay */}
      <div ref={trackListWrapperRef} style={styles.trackListWrapper}>
        <TrackList
          projectId={projectId}
          tracks={tracks}
          clips={clips}
          pxPerFrame={pxPerFrame}
          selectedClipIds={selectedClipIdSet}
          laneWidth={laneWidth}
          scrollOffsetX={scrollOffsetX}
          height={trackListHeight}
          dragInfo={dragInfo}
          onClipPointerDown={onClipPointerDown}
          trimInfo={trimInfo}
          getTrimCursor={getTrimCursor}
          onTrimPointerDown={onTrimPointerDown}
          onRename={onRenameTrack}
          onToggleMute={onToggleMute}
          onToggleLock={onToggleLock}
          onAssetDrop={handleAssetDrop}
          onEmptyAreaDrop={handleEmptyAreaDrop}
          onReorderTracks={onReorderTracks}
          onDeleteTrack={onDeleteTrack}
          listRef={trackListRef}
        />
        {/* Playhead needle — always mounted; rAF bridge mutates left/display directly.
            React-controlled left/display remain correct after pause and on re-renders. */}
        <div
          ref={needleRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: playheadPx,
            width: 2,
            height: '100%',
            background: PLAYHEAD_COLOR,
            pointerEvents: 'none',
            zIndex: 20,
            display: playheadVisible ? 'block' : 'none',
          }}
        />
      </div>

      {/* Horizontal scrollbar strip */}
      <ScrollbarStrip
        scrollOffsetX={scrollOffsetX}
        laneWidth={laneWidth}
        totalContentWidth={scrollableWidth}
        scrollOffsetXRef={scrollOffsetXRef}
        headerWidth={TRACK_HEADER_WIDTH}
      />
    </div>
  );
}
