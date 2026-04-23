/**
 * GhostDragPortal — renders a full-opacity clone of a dragged node
 * via ReactDOM.createPortal so it escapes the React Flow canvas transform.
 *
 * The clone follows the cursor at a fixed viewport position derived from
 * `dragState.clientX/Y` (screen coordinates passed up by useStoryboardDrag).
 *
 * The clone itself is a simplified visual representation of the scene block
 * (matching colours and size) — it does not need to be an exact replica
 * because it is transient and cursor-local.
 */

import React from 'react';
import ReactDOM from 'react-dom';

import type { GhostDragState } from '../hooks/useStoryboardDrag';
import { storyboardPageStyles as s } from './storyboardPageStyles';
import {
  SURFACE_ELEVATED,
  BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  PRIMARY,
} from './storyboardPageStyles';

// ── Clone appearance ───────────────────────────────────────────────────────────

const CLONE_ROOT_STYLE: React.CSSProperties = {
  background: SURFACE_ELEVATED,
  border: `1.5px solid ${PRIMARY}`,
  borderRadius: '8px',
  width: '220px',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  overflow: 'hidden',
  userSelect: 'none',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
};

const CLONE_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 8px',
  borderBottom: `1px solid ${BORDER}`,
};

const CLONE_LABEL_STYLE: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: TEXT_PRIMARY,
};

const CLONE_BODY_STYLE: React.CSSProperties = {
  padding: '8px 8px',
  fontSize: '12px',
  color: TEXT_SECONDARY,
};

// ── Component ──────────────────────────────────────────────────────────────────

interface GhostDragPortalProps {
  dragState: GhostDragState;
}

/**
 * Renders a full-opacity scene block clone that follows the cursor.
 * Mounted to `document.body` via a Portal to escape canvas CSS transforms.
 */
export function GhostDragPortal({ dragState }: GhostDragPortalProps): React.ReactElement | null {
  // Don't render until the cursor has moved at least once (clientX/Y are 0 initially).
  if (dragState.clientX === 0 && dragState.clientY === 0) return null;

  const cloneStyle: React.CSSProperties = {
    ...s.ghostClone,
    left: dragState.clientX,
    top: dragState.clientY,
    width: dragState.nodeWidth,
  };

  const sceneName =
    (dragState.node.data as { block?: { name?: string | null } })?.block?.name ?? 'SCENE';

  const portal = (
    <div style={cloneStyle} data-testid="ghost-drag-clone">
      <div style={CLONE_ROOT_STYLE}>
        <div style={CLONE_HEADER_STYLE}>
          <span style={CLONE_LABEL_STYLE}>{sceneName}</span>
        </div>
        <div style={CLONE_BODY_STYLE}>Moving…</div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(portal, document.body);
}
