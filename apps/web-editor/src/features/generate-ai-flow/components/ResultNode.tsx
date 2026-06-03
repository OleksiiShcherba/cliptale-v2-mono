/**
 * ResultNode — the output of a generation block on the flow canvas (T17 + T20).
 *
 * Single INPUT port (left, from its source generation block's output) and a single
 * OUTPUT port (right) carrying the result's modality, so a completed result is reusable
 * directly as an input to another generation block (AC-18) without re-importing it
 * through the library.
 *
 * T20 wiring — driven by the resolved job in node data (from useFlowGeneration):
 *   - running   → live progress bar (AC-08)
 *   - completed → the DOMINANT media preview occupying the majority of the block:
 *                 image = <img>, video = <video controls>, audio = <audio controls>
 *                 (AC-08 image/video/audio all render; AC-12 audio, AC-13 video)
 *   - failed    → the failure reason in plain language + a Retry button (a fresh,
 *                 charged Generate via onRetry) (AC-09)
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowBlock } from '@ai-video-editor/project-schema';

import type { AiGenerationJob } from '@/shared/ai-generation/types';

import { ERROR, MODALITY_COLOR, PRIMARY, handleBase, nodeHeader, nodeRoot, nodeSelectedOutline, nodeSubtle } from './flowNodeStyles';
import type { Modality } from '../hooks/useFlowCanvas';
import { useResultExtras } from './flowExtrasContext';
import { NodeDeleteButton } from './NodeDeleteButton';

export type ResultNodeData = {
  block: FlowBlock;
  /** Output modality, resolved by the canvas from the source generation model. */
  modality?: Modality;
  /** Resolved job state (live from useJobPolling or the reattach seed). */
  job?: AiGenerationJob | null;
  /** Streamable/displayable URL for the produced media, on completion. */
  previewUrl?: string | null;
  /** Fresh, charged Generate of this block (AC-09 retry). */
  onRetry?: () => void;
};

const mediaBox: React.CSSProperties = {
  width: '100%',
  minHeight: 140,
  maxHeight: 220,
  borderRadius: 8,
  background: '#000',
  display: 'block',
  objectFit: 'contain',
};

function DominantMedia({
  modality,
  previewUrl,
}: {
  modality?: Modality;
  previewUrl?: string | null;
}): React.ReactElement {
  const src = previewUrl ?? '';
  if (modality === 'video') {
    return <video data-testid="result-media-video" src={src} controls style={mediaBox} />;
  }
  if (modality === 'audio') {
    return (
      <audio data-testid="result-media-audio" src={src} controls style={{ width: '100%', display: 'block' }} />
    );
  }
  // image (and any default) → large preview
  return <img data-testid="result-media-image" src={src} alt="Generated result" style={mediaBox} />;
}

export function ResultNode({ id, data, selected }: NodeProps): React.ReactElement {
  const nodeData = data as ResultNodeData;
  const { block, modality } = nodeData;
  // Dynamic result state comes from the FlowExtras context (keeping the xyflow node
  // array stable); the isolated render path may still pass it via `data`.
  const extras = useResultExtras(id);
  const job = nodeData.job ?? extras.job;
  const previewUrl = nodeData.previewUrl ?? extras.previewUrl;
  const onRetry = nodeData.onRetry ?? extras.onRetry;
  const color = modality ? MODALITY_COLOR[modality] ?? '#888' : '#888';
  const status = job?.status;

  return (
    <div
      style={selected ? { ...nodeRoot, ...nodeSelectedOutline } : nodeRoot}
      data-testid="result-node"
      data-block-id={id}
      data-source-block-id={block.params.sourceBlockId as string | undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ ...handleBase, background: '#7C3AED', left: -6 }}
        aria-label="Result input"
      />

      <div style={{ ...nodeHeader, color }}>
        <span>Result{modality ? ` · ${modality}` : ''}</span>
        <NodeDeleteButton blockId={id} />
      </div>

      {/* DOMINANT result area (AC-08) — secondary labels/controls below. */}
      {status === 'completed' ? (
        <DominantMedia modality={modality} previewUrl={previewUrl} />
      ) : status === 'failed' ? (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: ERROR, fontSize: 12 }}>
            Generation failed: {job?.errorMessage ?? 'Unknown error.'}
          </div>
          <button
            type="button"
            onClick={() => onRetry?.()}
            aria-label="Retry generation"
            style={{
              alignSelf: 'flex-start',
              background: PRIMARY,
              border: 'none',
              color: '#fff',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : status === 'queued' || status === 'processing' ? (
        <div data-testid="result-progress" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{ height: 6, borderRadius: 3, background: '#252535', overflow: 'hidden' }}
            role="progressbar"
            aria-valuenow={job?.progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ height: '100%', width: `${job?.progress ?? 0}%`, background: PRIMARY }} />
          </div>
          <div style={nodeSubtle}>Generating… {job?.progress ?? 0}%</div>
        </div>
      ) : (
        <div style={nodeSubtle}>No result yet</div>
      )}

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
