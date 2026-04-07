import React from 'react';

import type { VideoClip } from '@ai-video-editor/project-schema';

import { useProjectStore } from '@/store/project-store';
import { useVideoClipEditor } from '@/features/timeline/hooks/useVideoClipEditor';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';
const SURFACE = '#0D0D14';

// ---------------------------------------------------------------------------
// VideoClipEditorPanel
// ---------------------------------------------------------------------------

/** Props for {@link VideoClipEditorPanel}. */
export interface VideoClipEditorPanelProps {
  clip: VideoClip;
  onClose?: () => void;
}

/**
 * Inspector panel for a selected `VideoClip`.  Renders controls for:
 * - Start frame (timeline position where the clip begins, ≥ 0)
 * - End frame (computed from startFrame + durationFrames)
 * - Start at second (trimInFrame converted to seconds — asset playback offset)
 * - Opacity (0 – 100 %, stored as 0 – 1)
 * - Volume (0 – 100 %, stored as 0 – 1)
 *
 * All mutations go through `useVideoClipEditor` which writes directly to the
 * project store — no local component state for clip values.
 */
export function VideoClipEditorPanel({ clip, onClose }: VideoClipEditorPanelProps): React.ReactElement {
  const { fps } = useProjectStore();
  const { setStartFrame, setEndFrame, setTrimInSeconds, setOpacity, setVolume } = useVideoClipEditor(clip);

  const endFrame = clip.startFrame + clip.durationFrames;
  const trimInSeconds = fps > 0 ? (clip.trimInFrame ?? 0) / fps : 0;
  const opacityPercent = Math.round(clip.opacity * 100);
  const volumePercent = Math.round(clip.volume * 100);

  const handleTrimInSeconds = (value: string): void => {
    const secs = parseFloat(value);
    if (Number.isFinite(secs) && secs >= 0) {
      setTrimInSeconds(secs);
    }
  };

  const handleOpacityPercent = (value: string): void => {
    const pct = parseFloat(value);
    if (Number.isFinite(pct)) {
      setOpacity(Math.min(100, Math.max(0, pct)) / 100);
    }
  };

  const handleVolumePercent = (value: string): void => {
    const pct = parseFloat(value);
    if (Number.isFinite(pct)) {
      setVolume(Math.min(100, Math.max(0, pct)) / 100);
    }
  };

  return (
    <section style={styles.panel} aria-label="Video clip editor">
      <div style={styles.panelHeader}>
        <h2 style={styles.heading}>Video</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close video clip editor"
            style={styles.closeButton}
          >
            ✕
          </button>
        )}
      </div>

      {/* Start / End frame row */}
      <div style={styles.row}>
        <div style={styles.field}>
          <label htmlFor="video-start-frame" style={styles.label}>
            START FRAME
          </label>
          <input
            id="video-start-frame"
            type="number"
            min={0}
            step={1}
            value={clip.startFrame}
            onChange={(e) => setStartFrame(Number(e.target.value))}
            style={styles.input}
            aria-label="Start frame"
          />
        </div>
        <div style={styles.field}>
          <label htmlFor="video-end-frame" style={styles.label}>
            END FRAME
          </label>
          <input
            id="video-end-frame"
            type="number"
            min={clip.startFrame + 1}
            step={1}
            value={endFrame}
            onChange={(e) => setEndFrame(Number(e.target.value))}
            style={styles.input}
            aria-label="End frame"
          />
        </div>
      </div>

      {/* Start at second (trim-in) */}
      <div style={styles.field}>
        <label htmlFor="video-trim-in-seconds" style={styles.label}>
          START AT SECOND
        </label>
        <input
          id="video-trim-in-seconds"
          type="number"
          min={0}
          step={0.1}
          value={parseFloat(trimInSeconds.toFixed(2))}
          onChange={(e) => handleTrimInSeconds(e.target.value)}
          style={styles.input}
          aria-label="Start at second"
        />
        <span style={styles.hint}>
          Asset playback starts at this offset ({clip.trimInFrame ?? 0} frame{(clip.trimInFrame ?? 0) !== 1 ? 's' : ''} @ {fps} fps)
        </span>
      </div>

      {/* Opacity */}
      <div style={styles.field}>
        <label htmlFor="video-opacity" style={styles.label}>
          OPACITY (%)
        </label>
        <input
          id="video-opacity"
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

      {/* Volume */}
      <div style={styles.field}>
        <label htmlFor="video-volume" style={styles.label}>
          VOLUME (%)
        </label>
        <input
          id="video-volume"
          type="number"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onChange={(e) => handleVolumePercent(e.target.value)}
          style={styles.input}
          aria-label="Volume percentage"
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

  row: {
    display: 'flex',
    gap: '8px',
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
    background: SURFACE,
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
