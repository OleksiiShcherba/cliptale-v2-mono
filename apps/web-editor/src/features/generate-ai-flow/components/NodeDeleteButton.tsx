/**
 * NodeDeleteButton — the small "×" affordance in a node header that removes the block
 * (and its connections) from the canvas. The onDelete handler is supplied per-block via
 * FlowExtrasContext (FlowEditorPage routes it to useFlowCanvas.removeBlock + clears the
 * Inspector selection). Renders nothing when no delete handler is wired (e.g. isolated
 * node-render tests), so node components can include it unconditionally.
 *
 * `nodrag` keeps a click from starting an xyflow node drag; stopPropagation keeps it from
 * also selecting the node.
 */

import React from 'react';

import { useNodeActions } from './flowExtrasContext';
import { TEXT_SECONDARY } from './flowNodeStyles';

export function NodeDeleteButton({ blockId }: { blockId: string }): React.ReactElement | null {
  const { onDelete } = useNodeActions(blockId);
  if (!onDelete) return null;

  return (
    <button
      type="button"
      className="nodrag"
      aria-label="Delete block"
      title="Delete block"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      style={{
        flexShrink: 0,
        marginLeft: 8,
        width: 18,
        height: 18,
        lineHeight: '16px',
        textAlign: 'center',
        background: 'transparent',
        color: TEXT_SECONDARY,
        border: 'none',
        borderRadius: 4,
        fontSize: 14,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      ×
    </button>
  );
}
