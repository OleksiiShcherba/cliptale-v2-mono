/**
 * GenerationNode — a generation block on the flow canvas (T17 / AC-15).
 *
 * Renders one TYPED input handle per required model field (typed by the catalog
 * `modality`). An `image_url_list` field renders as a multi ("three dots") input —
 * three stacked dots indicating it accepts several image connections. The single
 * output port (right) carries the model's result modality and is wired into a
 * result block. Selecting a model + editing optional params is wired in T18.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowBlock } from '@ai-video-editor/project-schema';

import { getModelById, requiredHandlesForModel } from '../hooks/useFlowCanvas';
import type { TypedHandle } from '../hooks/useFlowCanvas';
import { useGenerationExtras } from './flowExtrasContext';
import { NodeDeleteButton } from './NodeDeleteButton';
import {
  MODALITY_COLOR,
  PRIMARY,
  TEXT_SECONDARY,
  handleBase,
  handleRow,
  nodeHeader,
  nodeRoot,
  nodeSelectedOutline,
  nodeSubtle,
} from './flowNodeStyles';

export type GenerationNodeData = {
  block: FlowBlock;
  /** Optional: open the model picker / inspector (wired in T18). */
  onSelectModel?: (blockId: string) => void;
  /** Optional: start the spend-gated Generate for this block (T22). */
  onGenerate?: (blockId: string) => void;
};

/** A single typed input handle row. image_url_list renders as a three-dots multi input. */
function HandleRow({ handle, blockId }: { handle: TypedHandle; blockId: string }): React.ReactElement {
  const color = MODALITY_COLOR[handle.modality] ?? '#888';
  return (
    <div style={handleRow} data-testid={`handle-row-${handle.fieldName}`}>
      <Handle
        type="target"
        position={Position.Left}
        id={handle.fieldName}
        // Custom data-* used by tests + by the inspector to find the field.
        data-testid={`handle-${handle.fieldName}`}
        data-modality={handle.modality}
        data-list={handle.isList ? 'true' : 'false'}
        style={{ ...handleBase, background: color, left: -6 }}
        aria-label={`${handle.label} input (${handle.modality}${handle.isList ? ', multiple' : ''})`}
      />
      <span style={{ color }}>{handle.label}</span>
      <span style={nodeSubtle}>· {handle.modality}</span>
      {handle.isList ? (
        <span style={{ ...nodeSubtle, letterSpacing: 1 }} aria-hidden="true">
          ⋯
        </span>
      ) : null}
    </div>
  );
}

export function GenerationNode({ id, data, selected }: NodeProps): React.ReactElement {
  const nodeData = data as GenerationNodeData;
  const { block } = nodeData;
  // Dynamic handlers come from the FlowExtras context (so the xyflow node array stays
  // stable); the isolated render path may still pass them via `data`.
  const extras = useGenerationExtras(id);
  const onSelectModel = nodeData.onSelectModel ?? extras.onSelectModel;
  const onGenerate = nodeData.onGenerate ?? extras.onGenerate;
  const modelId = block.params.modelId as string | undefined;
  const model = getModelById(modelId);
  const handles = requiredHandlesForModel(modelId);

  return (
    <div
      style={selected ? { ...nodeRoot, ...nodeSelectedOutline } : nodeRoot}
      data-testid="generation-node"
      data-block-id={id}
    >
      <div style={nodeHeader}>
        <span>Generation</span>
        <NodeDeleteButton blockId={id} />
      </div>

      <button
        type="button"
        onClick={() => onSelectModel?.(id)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          color: model ? undefined : TEXT_SECONDARY,
          cursor: onSelectModel ? 'pointer' : 'default',
          fontSize: 12,
          padding: 0,
          marginBottom: 8,
        }}
        aria-label="Select model"
      >
        {model ? model.label : 'Select a model…'}
      </button>

      {handles.length === 0 ? (
        <div style={nodeSubtle}>No required inputs</div>
      ) : (
        handles.map((h) => <HandleRow key={h.fieldName} handle={h} blockId={id} />)
      )}

      {onGenerate ? (
        <button
          type="button"
          onClick={() => onGenerate(id)}
          aria-label="Generate"
          style={{
            marginTop: 8,
            width: '100%',
            background: PRIMARY,
            border: 'none',
            color: '#fff',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Generate
        </button>
      ) : null}

      {/* Output port — the produced result flows into a result block. */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ ...handleBase, background: '#7C3AED', right: -6 }}
        aria-label="Generation output"
      />
    </div>
  );
}
