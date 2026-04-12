import React from 'react';

import type { CaptionClip, TextOverlayClip } from '@ai-video-editor/project-schema';

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
  clip: TextOverlayClip | CaptionClip;
  onClose?: () => void;
}

/**
 * Inspector panel for a selected `TextOverlayClip` or `CaptionClip`.
 *
 * - `text-overlay` clips: text, start/end frame, font size, single color, position.
 * - `caption` clips: start/end frame, font size, active/inactive word colors, position.
 *
 * All mutations go through `useCaptionEditor` — no local component state for clip values.
 */
export function CaptionEditorPanel({ clip, onClose }: CaptionEditorPanelProps): React.ReactElement {
  const editors = useCaptionEditor(clip);

  const endFrame = clip.startFrame + clip.durationFrames;

  return (
    <section style={styles.panel} aria-label="Caption editor">
      <div style={styles.panelHeader}>
        <h2 style={styles.heading}>Caption</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close caption editor"
            style={styles.closeButton}
          >
            ✕
          </button>
        )}
      </div>

      {/* Text — text-overlay clips only */}
      {clip.type === 'text-overlay' && editors.type === 'text-overlay' && (
        <div style={styles.field}>
          <label htmlFor="caption-text" style={styles.label}>
            TEXT
          </label>
          <textarea
            id="caption-text"
            value={clip.text}
            onChange={(e) => editors.setText(e.target.value)}
            rows={3}
            style={styles.textarea}
            aria-label="Caption text"
          />
        </div>
      )}

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
            onChange={(e) => editors.setStartFrame(Number(e.target.value))}
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
            onChange={(e) => editors.setEndFrame(Number(e.target.value))}
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
          onChange={(e) => editors.setFontSize(Number(e.target.value))}
          style={styles.input}
          aria-label="Font size"
        />
      </div>

      {/* Color — text-overlay clips only */}
      {clip.type === 'text-overlay' && editors.type === 'text-overlay' && (
        <div style={styles.field}>
          <label htmlFor="caption-color" style={styles.label}>
            COLOR
          </label>
          <input
            id="caption-color"
            type="text"
            value={clip.color}
            onChange={(e) => editors.setColor(e.target.value)}
            style={styles.input}
            placeholder="#FFFFFF"
            aria-label="Text color (hex)"
          />
        </div>
      )}

      {/* Active / inactive word colors — caption clips only */}
      {clip.type === 'caption' && editors.type === 'caption' && (
        <>
          <div style={styles.field}>
            <label htmlFor="caption-active-color" style={styles.label}>
              ACTIVE WORD COLOR
            </label>
            <input
              id="caption-active-color"
              type="text"
              value={clip.activeColor}
              onChange={(e) => editors.setActiveColor(e.target.value)}
              style={styles.input}
              placeholder="#FFFFFF"
              aria-label="Active word color (hex)"
            />
          </div>
          <div style={styles.field}>
            <label htmlFor="caption-inactive-color" style={styles.label}>
              INACTIVE WORD COLOR
            </label>
            <input
              id="caption-inactive-color"
              type="text"
              value={clip.inactiveColor}
              onChange={(e) => editors.setInactiveColor(e.target.value)}
              style={styles.input}
              placeholder="rgba(255,255,255,0.35)"
              aria-label="Inactive word color (hex)"
            />
          </div>
        </>
      )}

      {/* Position */}
      <div style={styles.field}>
        <label htmlFor="caption-position" style={styles.label}>
          POSITION
        </label>
        <select
          id="caption-position"
          value={clip.position}
          onChange={(e) => editors.setPosition(e.target.value as 'top' | 'center' | 'bottom')}
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
