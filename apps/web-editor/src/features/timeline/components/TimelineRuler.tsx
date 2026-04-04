import React, { useCallback, useMemo, useRef } from 'react';

import { setPlayheadFrame, setPxPerFrame } from '@/store/ephemeral-store';
import { formatTimecode } from '@/shared/utils/formatTimecode';

// Design tokens
const RULER_HEIGHT = 28;
const RULER_BG = '#0D0D14';
const RULER_BORDER_COLOR = '#252535';
const RULER_TEXT_COLOR = '#8A8AA0';
const RULER_TICK_COLOR = '#252535';
const RULER_MAJOR_TICK_COLOR = '#8A8AA0';

/** Minimum pixels between major tick labels before we skip one. */
const MIN_LABEL_SPACING_PX = 60;

/** Number of minor ticks between each major tick. */
const MINOR_TICKS_PER_MAJOR = 4;

interface TimelineRulerProps {
  /** Total duration of the project in frames. */
  durationFrames: number;
  /** Pixels per frame — determines tick density. */
  pxPerFrame: number;
  /** Frames per second — used for timecode formatting. */
  fps: number;
  /** Horizontal scroll offset in pixels. */
  scrollOffsetX: number;
  /** Width of the ruler in pixels. */
  width: number;
}

/**
 * Renders a horizontal ruler with frame/timecode tick marks.
 * Tick density adapts to `pxPerFrame` so the ruler stays readable
 * at all zoom levels (1–100 px/frame).
 *
 * Clicking the ruler seeks the playhead to the clicked frame.
 * Wheel events on the ruler zoom the timeline.
 */
export function TimelineRuler({
  durationFrames,
  pxPerFrame,
  fps,
  scrollOffsetX,
  width,
}: TimelineRulerProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Compute the major tick interval in frames.
   * We want major ticks to be at least MIN_LABEL_SPACING_PX apart.
   */
  const majorTickFrames = useMemo((): number => {
    const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3000, 6000];
    for (const candidate of candidates) {
      if (candidate * pxPerFrame >= MIN_LABEL_SPACING_PX) {
        return candidate;
      }
    }
    return candidates[candidates.length - 1]!;
  }, [pxPerFrame]);

  const minorTickFrames = majorTickFrames / MINOR_TICKS_PER_MAJOR;

  // Draw the ruler onto the canvas.
  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = RULER_HEIGHT * dpr;
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = RULER_BG;
      ctx.fillRect(0, 0, width, RULER_HEIGHT);

      // Bottom border line
      ctx.strokeStyle = RULER_BORDER_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, RULER_HEIGHT - 0.5);
      ctx.lineTo(width, RULER_HEIGHT - 0.5);
      ctx.stroke();

      // Determine the first visible frame
      const firstVisibleFrame = Math.floor(scrollOffsetX / pxPerFrame);
      const lastVisibleFrame = Math.min(
        durationFrames,
        Math.ceil((scrollOffsetX + width) / pxPerFrame),
      );

      // Determine the starting minor tick boundary
      const minorTickInterval = Math.max(1, Math.round(minorTickFrames));
      const firstTick = Math.floor(firstVisibleFrame / minorTickInterval) * minorTickInterval;

      ctx.font = '10px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      for (let frame = firstTick; frame <= lastVisibleFrame; frame += minorTickInterval) {
        const x = frame * pxPerFrame - scrollOffsetX;
        const isMajor = frame % majorTickFrames === 0;

        // Draw tick
        ctx.strokeStyle = isMajor ? RULER_MAJOR_TICK_COLOR : RULER_TICK_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const tickHeight = isMajor ? 10 : 5;
        ctx.moveTo(x, RULER_HEIGHT - tickHeight);
        ctx.lineTo(x, RULER_HEIGHT);
        ctx.stroke();

        // Draw label on major ticks only
        if (isMajor) {
          const label = formatTimecode(frame, fps);
          ctx.fillStyle = RULER_TEXT_COLOR;
          ctx.fillText(label, x + 3, RULER_HEIGHT / 2 - 2);
        }
      }
    },
    [durationFrames, fps, majorTickFrames, minorTickFrames, pxPerFrame, scrollOffsetX, width],
  );

  // Re-draw whenever props change.
  const canvasCallback = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;
        draw(canvas);
      }
    },
    [draw],
  );

  React.useEffect(() => {
    if (canvasRef.current) {
      draw(canvasRef.current);
    }
  }, [draw]);

  /** Seek playhead on click. */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const frame = Math.round((x + scrollOffsetX) / pxPerFrame);
      const clamped = Math.max(0, Math.min(durationFrames - 1, frame));
      setPlayheadFrame(clamped);
    },
    [durationFrames, pxPerFrame, scrollOffsetX],
  );

  /** Wheel event: zoom the timeline. Shift+wheel is horizontal scroll (handled by parent). */
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      // deltaY > 0 = scroll down = zoom out; deltaY < 0 = scroll up = zoom in
      const delta = -e.deltaY * 0.05;
      setPxPerFrame(pxPerFrame + delta);
    },
    [pxPerFrame],
  );

  return (
    <canvas
      ref={canvasCallback}
      width={width}
      height={RULER_HEIGHT}
      onClick={handleClick}
      onWheel={handleWheel}
      aria-label="Timeline ruler — click to seek, scroll to zoom"
      role="slider"
      style={styles.canvas}
    />
  );
}

const styles = {
  canvas: {
    display: 'block',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,
};
