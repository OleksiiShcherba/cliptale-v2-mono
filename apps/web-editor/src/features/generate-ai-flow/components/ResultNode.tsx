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
 *
 * T18 extension — when the flow is linked to a storyboard reference block, node data
 * carries a `referenceContext` which enables AC-06/07 star controls:
 *   - star toggle (versionless, optimistic, rollback on API failure)
 *   - primary-star toggle (makes this result the block preview)
 *   - no-preview placeholder / fallback-preview indicator states
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
import { starReferenceResult, unstarReferenceResult } from '../api';
import type { StarEntry } from '../types';

// ── Reference context (T18 / AC-06 / AC-07) ──────────────────────────────────

export type ReferenceContext = {
  draftId: string;
  blockId: string;
  stars: StarEntry[];
  previewFileId: string | null;
  onStarToggle: (fileId: string, isPrimary?: boolean) => void;
  onUnstar: (fileId: string) => void;
};

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
  /**
   * Present only when the flow is linked to a storyboard reference block (T18).
   * Enables star/primary-star controls (AC-06 / AC-07).
   */
  referenceContext?: ReferenceContext;
};

// An audio (music) result renders a timeline scrubber — stretch the block wider than
// the default node so the Creator has real control over the listening position
// (a ~200px scrubber is too coarse to seek within a generated track).
const audioNodeRoot: React.CSSProperties = { ...nodeRoot, minWidth: 380 };

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

// ── Star controls (AC-06 / AC-07) ────────────────────────────────────────────

const starBtnBase: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: 16,
  lineHeight: 1,
  borderRadius: 4,
};

function StarControls({
  fileId,
  referenceContext,
}: {
  fileId: string;
  referenceContext: ReferenceContext;
}): React.ReactElement {
  const { draftId, blockId, stars, previewFileId, onStarToggle, onUnstar } = referenceContext;

  const starEntry = stars.find((s) => s.fileId === fileId);
  const isStarred = starEntry != null;
  const isPrimary = starEntry?.isPrimary ?? false;

  // Fallback state: file is starred but not the primary (previewFileId points elsewhere or null).
  const isFallback = isStarred && !isPrimary;

  async function handleStarClick(): Promise<void> {
    if (isStarred) {
      // Un-star optimistically via context callback, then call API.
      onUnstar(fileId);
      try {
        await unstarReferenceResult(draftId, blockId, fileId);
      } catch {
        // Roll back by re-starring — use onStarToggle to inform parent.
        onStarToggle(fileId, isPrimary);
      }
    } else {
      // Star optimistically, then call API; roll back via onUnstar on failure.
      onStarToggle(fileId, false);
      try {
        await starReferenceResult(draftId, blockId, fileId, { isPrimary: false });
      } catch {
        onUnstar(fileId);
      }
    }
  }

  async function handlePrimaryClick(): Promise<void> {
    if (isPrimary) {
      // Demote primary → un-star (AC-07).
      onUnstar(fileId);
      try {
        await unstarReferenceResult(draftId, blockId, fileId);
      } catch {
        onStarToggle(fileId, true);
      }
    } else {
      // Make primary.
      onStarToggle(fileId, true);
      try {
        await starReferenceResult(draftId, blockId, fileId, { isPrimary: true });
      } catch {
        onUnstar(fileId);
      }
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
      {/* Star toggle */}
      <button
        type="button"
        data-testid="star-toggle"
        aria-pressed={isStarred}
        data-starred={isStarred ? 'true' : 'false'}
        aria-label={isStarred ? 'Unstar result' : 'Star result'}
        onClick={() => { void handleStarClick(); }}
        style={{ ...starBtnBase, color: isStarred ? '#FBBF24' : '#888' }}
      >
        {isStarred ? '★' : '☆'}
      </button>

      {/* Primary-star toggle (block preview) */}
      <button
        type="button"
        data-testid="primary-star-toggle"
        aria-pressed={isPrimary}
        data-primary={isPrimary ? 'true' : 'false'}
        aria-label={isPrimary ? 'Remove primary star' : 'Star as primary (block preview)'}
        onClick={() => { void handlePrimaryClick(); }}
        style={{ ...starBtnBase, color: isPrimary ? '#F59E0B' : '#555', fontSize: 12 }}
      >
        {isPrimary ? '◆' : '◇'}
      </button>

      {/* Fallback-preview indicator: starred but not primary */}
      {isFallback && (
        <span
          data-testid="reference-preview-fallback"
          style={{ fontSize: 10, color: '#9CA3AF' }}
          aria-label="Fallback preview"
        >
          fallback
        </span>
      )}

      {/* No-preview placeholder: no stars at all */}
      {!isStarred && stars.length === 0 && previewFileId == null && (
        <span
          data-testid="reference-no-preview"
          style={{ fontSize: 10, color: '#6B7280' }}
          aria-label="No preview"
        >
          no preview
        </span>
      )}
    </div>
  );
}

// ── ResultNode ────────────────────────────────────────────────────────────────

export function ResultNode({ id, data, selected }: NodeProps): React.ReactElement {
  const nodeData = data as ResultNodeData;
  const { block, modality } = nodeData;
  // Dynamic result state comes from the FlowExtras context (keeping the xyflow node
  // array stable); the isolated render path may still pass it via `data`.
  const extras = useResultExtras(id);
  const job = nodeData.job ?? extras.job;
  const previewUrl = nodeData.previewUrl ?? extras.previewUrl;
  const onRetry = nodeData.onRetry ?? extras.onRetry;
  // AC-06/07: reference context — extras take precedence (live state from FlowEditorPage).
  const referenceContext = extras.referenceContext ?? nodeData.referenceContext;
  const color = modality ? MODALITY_COLOR[modality] ?? '#888' : '#888';
  const status = job?.status;
  const rootStyle = modality === 'audio' ? audioNodeRoot : nodeRoot;

  // fileId for star operations: the result asset id from the job.
  const fileId = job?.resultAssetId ?? null;

  return (
    <div
      style={selected ? { ...rootStyle, ...nodeSelectedOutline } : rootStyle}
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

      {/* AC-06/07 star controls — only when the flow is a reference flow. */}
      {referenceContext != null && fileId != null && (
        <StarControls fileId={fileId} referenceContext={referenceContext} />
      )}

      {/* Star controls with no fileId yet (job null or resultAssetId null) —
          still show the no-preview placeholder so the star area is consistent. */}
      {referenceContext != null && fileId == null && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
          <button
            type="button"
            data-testid="star-toggle"
            aria-pressed={false}
            data-starred="false"
            aria-label="Star result"
            disabled
            style={{ ...starBtnBase, color: '#888', opacity: 0.5 }}
          >
            ☆
          </button>
          <button
            type="button"
            data-testid="primary-star-toggle"
            aria-pressed={false}
            data-primary="false"
            aria-label="Set as primary (block preview)"
            disabled
            style={{ ...starBtnBase, color: '#555', fontSize: 12, opacity: 0.5 }}
          >
            ◇
          </button>
          {referenceContext.stars.length === 0 && referenceContext.previewFileId == null && (
            <span
              data-testid="reference-no-preview"
              style={{ fontSize: 10, color: '#6B7280' }}
              aria-label="No preview"
            >
              no preview
            </span>
          )}
        </div>
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
