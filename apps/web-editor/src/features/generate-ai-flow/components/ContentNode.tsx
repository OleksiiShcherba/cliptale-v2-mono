/**
 * ContentNode — a content block (text / image / audio / video) on the flow canvas (T17).
 *
 * Shows the content kind + a preview of its supplied value:
 *   - text  → the typed text (truncated)
 *   - media → a DOMINANT preview of the selected library asset (image = large <img>,
 *             video = <video>, audio = <audio>), resolved from the block's fileId via
 *             useFileStreamUrl. Empty media blocks prompt to add an asset.
 *
 * Exposes a single typed OUTPUT port whose colour reflects its modality, wireable into
 * a compatible generation input handle.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowBlock } from '@ai-video-editor/project-schema';

import { useFileStreamUrl } from '@/shared/hooks/useFileStreamUrl';
import { NodeDeleteButton } from './NodeDeleteButton';
import type { Modality } from '../hooks/useFlowCanvas';
import {
  MODALITY_COLOR,
  handleBase,
  nodeHeader,
  nodeRoot,
  nodeSelectedOutline,
  nodeSubtle,
} from './flowNodeStyles';

export type ContentNodeData = { block: FlowBlock };

const MODALITY_LABEL: Record<Modality, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
};

/** Big media preview box — the asset dominates the block (mirrors ResultNode's mediaBox). */
const mediaBox: React.CSSProperties = {
  width: '100%',
  minHeight: 120,
  maxHeight: 200,
  borderRadius: 8,
  background: '#000',
  display: 'block',
  objectFit: 'contain',
};

/** The dominant preview for a media content block once its asset URL has resolved. */
function ContentMedia({
  modality,
  previewUrl,
}: {
  modality: Modality;
  previewUrl: string;
}): React.ReactElement {
  if (modality === 'video') {
    return <video data-testid="content-media-video" src={previewUrl} controls style={mediaBox} />;
  }
  if (modality === 'audio') {
    return (
      <audio
        data-testid="content-media-audio"
        src={previewUrl}
        controls
        style={{ width: '100%', display: 'block' }}
      />
    );
  }
  // image (and any default) → large preview
  return (
    <img data-testid="content-media-image" src={previewUrl} alt="Selected content" style={mediaBox} />
  );
}

export function ContentNode({ id, data, selected }: NodeProps): React.ReactElement {
  const { block } = data as ContentNodeData;
  const modality = (block.params.modality as Modality | undefined) ?? 'text';
  const color = MODALITY_COLOR[modality] ?? '#888';
  const text = block.params.text as string | undefined;
  const fileId = block.params.fileId as string | undefined;

  const isMedia = modality !== 'text';
  // Resolve the selected asset's preview URL (no-op for text / empty media blocks).
  const { url: previewUrl } = useFileStreamUrl(isMedia && fileId ? fileId : null);

  return (
    <div
      style={selected ? { ...nodeRoot, ...nodeSelectedOutline } : nodeRoot}
      data-testid="content-node"
      data-block-id={id}
      data-modality={modality}
    >
      <div style={{ ...nodeHeader, color }}>
        <span>{MODALITY_LABEL[modality]} content</span>
        <NodeDeleteButton blockId={id} />
      </div>

      {modality === 'text' ? (
        <div style={nodeSubtle}>{text ? text.slice(0, 60) : 'Empty — add text'}</div>
      ) : !fileId ? (
        <div style={nodeSubtle}>No asset selected</div>
      ) : previewUrl ? (
        <ContentMedia modality={modality} previewUrl={previewUrl} />
      ) : (
        <div style={nodeSubtle}>Loading preview…</div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ ...handleBase, background: color, right: -6 }}
        aria-label={`${MODALITY_LABEL[modality]} output`}
      />
    </div>
  );
}
