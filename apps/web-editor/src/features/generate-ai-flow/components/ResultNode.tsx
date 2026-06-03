/**
 * ResultNode — the output of a generation block on the flow canvas (T17).
 *
 * Has a single INPUT port (left, wired from its source generation block's output) and a
 * single OUTPUT port (right) carrying the result's modality, so a completed result can be
 * reused directly as an input to another generation block (AC-18) without re-importing it
 * through the library. Live progress + dominant media preview rendering is wired in T20;
 * here it shows the result modality + a placeholder.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowBlock } from '@ai-video-editor/project-schema';

import { MODALITY_COLOR, handleBase, nodeHeader, nodeRoot, nodeSubtle } from './flowNodeStyles';
import type { Modality } from '../hooks/useFlowCanvas';

export type ResultNodeData = {
  block: FlowBlock;
  /** Output modality, resolved by the canvas from the source generation model. */
  modality?: Modality;
};

export function ResultNode({ id, data }: NodeProps): React.ReactElement {
  const { block, modality } = data as ResultNodeData;
  const color = modality ? MODALITY_COLOR[modality] ?? '#888' : '#888';

  return (
    <div style={nodeRoot} data-testid="result-node" data-block-id={id} data-source-block-id={block.params.sourceBlockId as string | undefined}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ ...handleBase, background: '#7C3AED', left: -6 }}
        aria-label="Result input"
      />

      <div style={{ ...nodeHeader, color }}>
        <span>Result{modality ? ` · ${modality}` : ''}</span>
      </div>
      <div style={nodeSubtle}>No result yet</div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ ...handleBase, background: color, right: -6 }}
        aria-label="Result output (reusable as input)"
      />
    </div>
  );
}
