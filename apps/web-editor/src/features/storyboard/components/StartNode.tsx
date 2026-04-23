/**
 * StartNode — React Flow custom node for the START sentinel.
 *
 * Rendered at the left edge of the canvas on initial load.
 * Has a single exit port (source handle, right side) and NO income port.
 * Cannot be deleted by the user.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';

import type { SentinelNodeData } from '../types';
import { SURFACE_ELEVATED, sentinelNodeStyles as s } from './nodeStyles';

// ── Handle style — visible on hover via CSS class ──────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  background: '#7C3AED',
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

// ── Component ──────────────────────────────────────────────────────────────────

interface StartNodeProps {
  data: SentinelNodeData;
}

/**
 * Custom React Flow node for the START sentinel block.
 * Only has a source handle on the right side (exit port).
 */
export function StartNode({ data }: StartNodeProps): React.ReactElement {
  return (
    <div style={s.startRoot} data-testid="start-node">
      <span>{data.label}</span>

      {/* Exit port — right side only */}
      <Handle
        type="source"
        position={Position.Right}
        id="exit"
        style={HANDLE_STYLE}
        aria-label="Exit port"
      />
    </div>
  );
}
