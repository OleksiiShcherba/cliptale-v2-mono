import React from 'react';
import { useNavigate } from 'react-router-dom';

import { useMotionGraphicsList } from '@/features/motion-graphic/hooks';
import { useAddMotionGraphicToTimeline } from '@/features/motion-graphic/hooks/useAddMotionGraphicToTimeline.js';

// Design-guide tokens (§3 Dark Theme)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const ERROR = '#EF4444';

interface EditorMotionGraphicPanelProps {
  projectId: string;
}

/**
 * Left-sidebar panel (editor "Motion" tab) that lists the Creator's ready
 * Motion Graphics and lets them place one onto the project timeline as a
 * `motion-graphic` clip (ai-motion-graphic editor integration). Mirrors the
 * Asset Browser pattern: a scrollable list with a per-row primary action.
 */
export function EditorMotionGraphicPanel({ projectId }: EditorMotionGraphicPanelProps): React.ReactElement {
  const navigate = useNavigate();
  const { graphics, isLoading, isError } = useMotionGraphicsList();
  const { add, pendingId, error } = useAddMotionGraphicToTimeline(projectId);

  const ready = graphics.filter((g) => g.status === 'ready');

  return (
    <div style={styles.container} data-testid="editor-motion-graphic-panel">
      <div style={styles.header}>
        <span style={styles.headerTitle}>Motion Graphics</span>
        <button
          type="button"
          style={styles.newButton}
          onClick={() => navigate('/motion-graphics/new')}
          data-testid="editor-mg-new"
        >
          + New
        </button>
      </div>

      {error && (
        <div style={styles.errorBox} role="alert" data-testid="editor-mg-error">
          {error}
        </div>
      )}

      <div style={styles.list}>
        {isLoading && <div style={styles.muted}>Loading Motion Graphics…</div>}
        {isError && <div style={styles.muted} role="alert">Could not load your Motion Graphics.</div>}
        {!isLoading && !isError && ready.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.muted}>You have no ready Motion Graphics yet.</p>
            <button
              type="button"
              style={styles.createCta}
              onClick={() => navigate('/motion-graphics/new')}
            >
              Create one
            </button>
          </div>
        )}
        {ready.map((g) => (
          <div key={g.id} style={styles.row} data-testid={`editor-mg-row-${g.id}`}>
            <div style={styles.rowInfo}>
              <span style={styles.badge}>Motion Graphic</span>
              <span style={styles.rowTitle} title={g.title}>{g.title}</span>
              <span style={styles.rowMeta}>{g.durationSeconds}s</span>
            </div>
            <button
              type="button"
              style={pendingId === g.id ? styles.addButtonPending : styles.addButton}
              disabled={pendingId !== null}
              onClick={() => void add(g)}
              data-testid={`editor-mg-add-${g.id}`}
            >
              {pendingId === g.id ? 'Adding…' : 'Add to timeline'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: SURFACE,
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,
  newButton: {
    fontSize: 12,
    color: PRIMARY,
    background: 'transparent',
    border: `1px solid ${PRIMARY}`,
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  } as React.CSSProperties,
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px',
    overflowY: 'auto',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
  } as React.CSSProperties,
  rowInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  } as React.CSSProperties,
  badge: {
    fontSize: 9,
    fontWeight: 500,
    color: PRIMARY,
    border: `1px solid ${PRIMARY}`,
    borderRadius: 4,
    padding: '3px 6px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    flexShrink: 0,
  } as React.CSSProperties,
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: TEXT_PRIMARY,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  rowMeta: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    flexShrink: 0,
  } as React.CSSProperties,
  addButton: {
    fontSize: 12,
    fontWeight: 500,
    color: '#FFFFFF',
    background: PRIMARY,
    border: 'none',
    borderRadius: 6,
    padding: '6px 10px',
    cursor: 'pointer',
  } as React.CSSProperties,
  addButtonPending: {
    fontSize: 12,
    fontWeight: 500,
    color: TEXT_SECONDARY,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: '6px 10px',
    cursor: 'default',
  } as React.CSSProperties,
  muted: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    padding: '8px',
  } as React.CSSProperties,
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px',
  } as React.CSSProperties,
  createCta: {
    fontSize: 12,
    color: PRIMARY,
    background: 'transparent',
    border: `1px solid ${PRIMARY}`,
    borderRadius: 6,
    padding: '6px 10px',
    cursor: 'pointer',
  } as React.CSSProperties,
  errorBox: {
    margin: '8px',
    padding: '8px 10px',
    background: 'rgba(239,68,68,0.1)',
    border: `1px solid ${ERROR}`,
    borderRadius: 8,
    color: ERROR,
    fontSize: 12,
  } as React.CSSProperties,
} as const;
