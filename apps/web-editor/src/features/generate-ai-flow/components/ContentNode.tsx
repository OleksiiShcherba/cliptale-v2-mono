/**
 * ContentNode — a content block (text / image / audio / video) on the flow canvas (T17).
 *
 * Shows the content kind + a preview of its supplied value (full content editing —
 * typing text, uploading, picking a library asset — is wired in T18). Exposes a single
 * typed OUTPUT port whose colour reflects its modality, wireable into a compatible
 * generation input handle.
 */

import React from 'react';

import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { FlowBlock } from '@ai-video-editor/project-schema';

import type { Modality } from '../hooks/useFlowCanvas';
import {
  MODALITY_COLOR,
  handleBase,
  nodeHeader,
  nodeRoot,
  nodeSubtle,
} from './flowNodeStyles';

export type ContentNodeData = { block: FlowBlock };

const MODALITY_LABEL: Record<Modality, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
};

export function ContentNode({ id, data }: NodeProps): React.ReactElement {
  const { block } = data as ContentNodeData;
  const modality = (block.params.modality as Modality | undefined) ?? 'text';
  const color = MODALITY_COLOR[modality] ?? '#888';
  const text = block.params.text as string | undefined;
  const fileId = block.params.fileId as string | undefined;

  return (
    <div style={nodeRoot} data-testid="content-node" data-block-id={id} data-modality={modality}>
      <div style={{ ...nodeHeader, color }}>
        <span>{MODALITY_LABEL[modality]} content</span>
      </div>
      <div style={nodeSubtle}>
        {modality === 'text'
          ? text
            ? text.slice(0, 60)
            : 'Empty — add text'
          : fileId
            ? 'Asset selected'
            : 'No asset selected'}
      </div>

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
