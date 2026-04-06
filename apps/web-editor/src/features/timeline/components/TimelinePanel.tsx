import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Clip, Track } from '@ai-video-editor/project-schema';

import { useEphemeralStore, setPxPerFrame, setScrollOffsetX } from '@/store/ephemeral-store';
import { useProjectStore } from '@/store/project-store';
import { registerTimelinePlayheadUpdater, unregisterTimelinePlayheadUpdater, registerTrackListBounds } from '@/store/timeline-refs';

import { ScrollbarStrip } from './ScrollbarStrip';
import { TimelineRuler } from './TimelineRuler';
import { TrackList, TRACK_HEADER_WIDTH } from './TrackList';
import { useClipDeleteShortcut } from '../hooks/useClipDeleteShortcut';
import { useClipDrag } from '../hooks/useClipDrag';
import { useClipTrim } from '../hooks/useClipTrim';
import { useDropAssetToTimeline } from '../hooks/useDropAssetToTimeline';
import { PLAYHEAD_COLOR, TRACK_LIST_HEIGHT, styles } from './timelinePanelStyles';

interface TimelinePanelProps {
  /** Called when a track name is edited. */
  onRenameTrack: (trackId: string, newName: string) => void;
  /** Called when mute is toggled. */
  onToggleMute: (trackId: string) => void;
  /** Called when lock is toggled. */
  onToggleLock: (trackId: string) => void;
}

/**
 * Full-width timeline panel at the bottom of the editor.
 * Composes `TimelineRuler`, `TrackList`, and `ScrollbarStrip`, synchronising
 * their horizontal position via the ephemeral store's `scrollOffsetX`.
 *
 * Renders a 1px playhead needle overlaid on the track lane area, positioned
 * at `playheadFrame * pxPerFrame - scrollOffsetX` from the left of the lanes.
 * The needle is hidden when it scrolls outside the visible lane bounds.
 */
export function TimelinePanel({
  onRenameTrack,
  onToggleMute,
  onToggleLock,
}: TimelinePanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const rulerWrapperRef = useRef<HTMLDivElement>(null);
  const trackListWrapperRef = useRef<HTMLDivElement>(null);
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

  const laneWidth = Math.max(0, panelWidth - TRACK_HEADER_WIDTH);
  const totalContentWidth = durationFrames * pxPerFrame;

  const handleZoomIn = useCallback(() => setPxPerFrame(pxPerFrame * 1.25), [pxPerFrame]);
  const handleZoomOut = useCallback(() => setPxPerFrame(pxPerFrame / 1.25), [pxPerFrame]);

  // Refs to allow the wheel handler closure and rAF bridge to read current
  // layout values without stale captures.
  const scrollOffsetXRef = useRef(scrollOffsetX);
  scrollOffsetXRef.current = scrollOffsetX;
  const laneWidthRef = useRef(laneWidth);
  laneWidthRef.current = laneWidth;
  const totalContentWidthRef = useRef(totalContentWidth);
  totalContentWidthRef.current = totalContentWidth;
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

  // Attach wheel listeners as non-passive so preventDefault() is allowed.
  // React's synthetic onWheel is passive by default and blocks preventDefault.
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newOffset = scrollOffsetXRef.current + e.deltaX + e.deltaY;
      const maxOffset = Math.max(0, totalContentWidthRef.current - laneWidthRef.current);
      setScrollOffsetX(Math.max(0, Math.min(newOffset, maxOffset)));
    };

    const ruler = rulerWrapperRef.current;
    const trackList = trackListWrapperRef.current;
    ruler?.addEventListener('wheel', handleWheel, { passive: false });
    trackList?.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      ruler?.removeEventListener('wheel', handleWheel);
      trackList?.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Compute playhead needle position within the track list wrapper.
  // The needle left is relative to the wrapper, which starts at the left edge
  // of the header column. Add TRACK_HEADER_WIDTH so needle sits in the lane area.
  const playheadPx = playheadFrame * pxPerFrame - scrollOffsetX + TRACK_HEADER_WIDTH;
  const playheadVisible = playheadPx >= TRACK_HEADER_WIDTH && playheadPx <= TRACK_HEADER_WIDTH + laneWidth;

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
          height={TRACK_LIST_HEIGHT}
          dragInfo={dragInfo}
          onClipPointerDown={onClipPointerDown}
          trimInfo={trimInfo}
          getTrimCursor={getTrimCursor}
          onTrimPointerDown={onTrimPointerDown}
          onRename={onRenameTrack}
          onToggleMute={onToggleMute}
          onToggleLock={onToggleLock}
          onAssetDrop={handleAssetDrop}
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
        totalContentWidth={totalContentWidth}
        scrollOffsetXRef={scrollOffsetXRef}
        headerWidth={TRACK_HEADER_WIDTH}
      />
    </div>
  );
}

