import React from 'react';

import type { TextOverlayClip } from '@ai-video-editor/project-schema';

import { useCaptionEditor } from '@/features/captions/hooks/useCaptionEditor';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';

// ---------------------------------------------------------------------------
// CaptionEditorPanel
// ---------------------------------------------------------------------------

export interface CaptionEditorPanelProps {
  clip: TextOverlayClip;
}

/**
 * Inspector panel for a selected `TextOverlayClip`.  Renders editable fields
 * for all caption properties: text, start/end frame, font size, color, and
 * vertical position.  All mutations go through `useCaptionEditor` which writes
 * directly to the project store — no local component state for clip values.
 */
export function CaptionEditorPanel({ clip }: CaptionEditorPanelProps): React.ReactElement {
  const { setText, setStartFrame, setEndFrame, setFontSize, setColor, setPosition } =
    useCaptionEditor(clip);

  const endFrame = clip.startFrame + clip.durationFrames;

  return (
    <section style={styles.panel} aria-label="Caption editor">
      <h2 style={styles.heading}>Caption</h2>

      {/* Text */}
      <div style={styles.field}>
        <label htmlFor="caption-text" style={styles.label}>
          TEXT
        </label>
        <textarea
          id="caption-text"
          value={clip.text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={styles.textarea}
          aria-label="Caption text"
        />
      </div>

      {/* Start frame */}
      <div style={styles.row}>
        <div style={styles.field}>
          <label htmlFor="caption-start-frame" style={styles.label}>
            START FRAME
          </label>
          <input
            id="caption-start-frame"
            type="number"
            min={0}
            value={clip.startFrame}
            onChange={(e) => setStartFrame(Number(e.target.value))}
            style={styles.input}
            aria-label="Start frame"
          />
        </div>

        {/* End frame */}
        <div style={styles.field}>
          <label htmlFor="caption-end-frame" style={styles.label}>
            END FRAME
          </label>
          <input
            id="caption-end-frame"
            type="number"
            min={clip.startFrame + 1}
            value={endFrame}
            onChange={(e) => setEndFrame(Number(e.target.value))}
            style={styles.input}
            aria-label="End frame"
          />
        </div>
      </div>

      {/* Font size */}
      <div style={styles.field}>
        <label htmlFor="caption-font-size" style={styles.label}>
          FONT SIZE
        </label>
        <input
          id="caption-font-size"
          type="number"
          min={1}
          value={clip.fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          style={styles.input}
          aria-label="Font size"
        />
      </div>

      {/* Color */}
      <div style={styles.field}>
        <label htmlFor="caption-color" style={styles.label}>
          COLOR
        </label>
        <input
          id="caption-color"
          type="text"
          value={clip.color}
          onChange={(e) => setColor(e.target.value)}
          style={styles.input}
          placeholder="#FFFFFF"
          aria-label="Text color (hex)"
        />
      </div>

      {/* Position */}
      <div style={styles.field}>
        <label htmlFor="caption-position" style={styles.label}>
          POSITION
        </label>
        <select
          id="caption-position"
          value={clip.position}
          onChange={(e) => setPosition(e.target.value as 'top' | 'center' | 'bottom')}
          style={styles.select}
          aria-label="Vertical position"
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
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

  heading: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '24px',
  } as React.CSSProperties,

  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
  } as React.CSSProperties,

  row: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,

  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    letterSpacing: '0.05em',
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
  } as React.CSSProperties,

  textarea: {
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
    resize: 'vertical' as const,
    lineHeight: '20px',
  } as React.CSSProperties,

  select: {
    background: '#0D0D14',
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    padding: '8px',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
    accentColor: PRIMARY,
  } as React.CSSProperties,
} as const;
