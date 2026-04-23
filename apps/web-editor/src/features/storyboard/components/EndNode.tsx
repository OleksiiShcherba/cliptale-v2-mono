/**
 * EndNode — React Flow custom node for the END sentinel.
 *
 * Rendered at the right edge of the canvas on initial load.
 * Has a single income port (target handle, left side) and NO exit port.
 * Cannot be deleted by the user.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';

import type { SentinelNodeData } from '../types';
import { SURFACE_ELEVATED, sentinelNodeStyles as s } from './nodeStyles';

// ── Handle style ───────────────────────────────────────────────────────────────

const HANDLE_STYLE: React.CSSProperties = {
  background: '#8A8AA0',
  border: `2px solid ${SURFACE_ELEVATED}`,
  width: '10px',
  height: '10px',
  borderRadius: '50%',
};

// ── Component ──────────────────────────────────────────────────────────────────

interface EndNodeProps {
  data: SentinelNodeData;
}

/**
 * Custom React Flow node for the END sentinel block.
 * Only has a target handle on the left side (income port).
 */
export function EndNode({ data }: EndNodeProps): React.ReactElement {
  return (
    <div style={s.endRoot} data-testid="end-node">
      {/* Income port — left side only */}
      <Handle
        type="target"
        position={Position.Left}
        id="income"
        style={HANDLE_STYLE}
        aria-label="Income port"
      />

      <span>{data.label}</span>
    </div>
  );
}
