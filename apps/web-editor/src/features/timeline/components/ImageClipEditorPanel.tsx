import React from 'react';

import type { ImageClip } from '@ai-video-editor/project-schema';

import { useProjectStore } from '@/store/project-store';
import { useImageClipEditor } from '@/features/timeline/hooks/useImageClipEditor';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';

// ---------------------------------------------------------------------------
// ImageClipEditorPanel
// ---------------------------------------------------------------------------

/** Props for {@link ImageClipEditorPanel}. */
export interface ImageClipEditorPanelProps {
  clip: ImageClip;
  onClose?: () => void;
}

/**
 * Inspector panel for a selected `ImageClip`.  Renders controls for:
 * - Start frame (integer, ≥ 0)
 * - Duration (in seconds, converted to/from frames using the project FPS)
 * - Opacity (0 – 100 %, stored as 0 – 1)
 *
 * All mutations go through `useImageClipEditor` which writes directly to the
 * project store — no local component state for clip values.
 */
export function ImageClipEditorPanel({ clip, onClose }: ImageClipEditorPanelProps): React.ReactElement {
  const { fps } = useProjectStore();
  const { setStartFrame, setDurationFrames, setOpacity } = useImageClipEditor(clip);

  /** Duration displayed as seconds (rounded to 2 decimal places). */
  const durationSeconds = fps > 0 ? clip.durationFrames / fps : 0;

  const handleDurationSeconds = (value: string): void => {
    const secs = parseFloat(value);
    if (Number.isFinite(secs) && secs > 0) {
      setDurationFrames(Math.round(secs * fps));
    }
  };

  const handleOpacityPercent = (value: string): void => {
    const pct = parseFloat(value);
    if (Number.isFinite(pct)) {
      setOpacity(Math.min(100, Math.max(0, pct)) / 100);
    }
  };

  const opacityPercent = Math.round(clip.opacity * 100);

  return (
    <section style={styles.panel} aria-label="Image clip editor">
      <div style={styles.panelHeader}>
        <h2 style={styles.heading}>Image</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close image clip editor"
            style={styles.closeButton}
          >
            ✕
          </button>
        )}
      </div>

      {/* Start frame */}
      <div style={styles.field}>
        <label htmlFor="image-start-frame" style={styles.label}>
          START FRAME
        </label>
        <input
          id="image-start-frame"
          type="number"
          min={0}
          step={1}
          value={clip.startFrame}
          onChange={(e) => setStartFrame(Number(e.target.value))}
          style={styles.input}
          aria-label="Start frame"
        />
      </div>

      {/* Duration */}
      <div style={styles.field}>
        <label htmlFor="image-duration-seconds" style={styles.label}>
          DURATION (SECONDS)
        </label>
        <input
          id="image-duration-seconds"
          type="number"
          min={0.01}
          step={0.1}
          value={parseFloat(durationSeconds.toFixed(2))}
          onChange={(e) => handleDurationSeconds(e.target.value)}
          style={styles.input}
          aria-label="Duration in seconds"
        />
        <span style={styles.hint}>
          {clip.durationFrames} frame{clip.durationFrames !== 1 ? 's' : ''} @ {fps} fps
        </span>
      </div>

      {/* Opacity */}
      <div style={styles.field}>
        <label htmlFor="image-opacity" style={styles.label}>
          OPACITY (%)
        </label>
        <input
          id="image-opacity"
          type="number"
          min={0}
          max={100}
          step={1}
          value={opacityPercent}
          onChange={(e) => handleOpacityPercent(e.target.value)}
          style={styles.input}
          aria-label="Opacity percentage"
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  panel: {
    background: SURFACE_ELEVATED,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  } as React.CSSProperties,

  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    background: SURFACE_ELEVATED,
    margin: '-16px -16px 0',
    padding: '0 16px',
    flexShrink: 0,
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '24px',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
    fontSize: 14,
    borderRadius: 4,
  } as React.CSSProperties,

  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
  } as React.CSSProperties,

  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  hint: {
    fontSize: '11px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
  } as React.CSSProperties,

  input: {
    background: '#0D0D14',
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    padding: '8px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    accentColor: PRIMARY,
  } as React.CSSProperties,
} as const;
