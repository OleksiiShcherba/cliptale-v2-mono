/**
 * ReferenceGateMessage — displays the reference-done gate rejection (T10, AC-02 / AC-03b).
 *
 * AC-02 / AC-03b: when at least one reference block has not finished generating and
 * the Creator attempts to start scene illustrations, the server returns a 422 with
 * code 'references.reference_gate_failed'.  This component names exactly which blocks
 * are still generating and offers the existing reference-flow controls (retry / delete).
 *
 * UnlinkedScenesMessage — displayed when the 422 carries code 'references.unlinked_scenes'.
 *
 * AC-04b: one or more scene blocks have no linked reference block.  This component names
 * each unlinked scene and instructs the Creator to link a reference before starting.
 *
 * Both components render nothing when their respective list is empty.
 */

import React from 'react';

import { referenceGateMessageStyles as s } from './ReferenceGateMessage.styles';

// ── ReferenceGateMessage ───────────────────────────────────────────────────────

export interface BlockingBlock {
  blockId: string;
  name: string;
}

export interface ReferenceGateMessageProps {
  blocks: BlockingBlock[];
  onRetryBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
}

export function ReferenceGateMessage({
  blocks,
  onRetryBlock,
  onDeleteBlock,
}: ReferenceGateMessageProps): React.ReactElement | null {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div role="alert" style={s.root}>
      <p style={s.heading}>
        Scene illustrations cannot start — the following reference blocks have not finished
        generating. Finish generating, retry, or remove each block to continue.
      </p>
      <ul style={s.list}>
        {blocks.map((block) => (
          <li key={block.blockId} style={s.listItem}>
            <span style={s.blockName}>{block.name}</span>
            <button
              data-testid={`ref-gate-retry-${block.blockId}`}
              onClick={() => onRetryBlock(block.blockId)}
              style={s.retryButton}
            >
              Retry generation
            </button>
            <button
              data-testid={`ref-gate-delete-${block.blockId}`}
              onClick={() => onDeleteBlock(block.blockId)}
              style={s.deleteButton}
            >
              Remove block
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── UnlinkedScenesMessage ──────────────────────────────────────────────────────

export interface UnlinkedScene {
  blockId: string;
  name: string | null;
}

export interface UnlinkedScenesMessageProps {
  scenes: UnlinkedScene[];
}

export function UnlinkedScenesMessage({
  scenes,
}: UnlinkedScenesMessageProps): React.ReactElement | null {
  if (scenes.length === 0) {
    return null;
  }

  return (
    <div role="alert" style={s.root}>
      <p style={s.heading}>
        Scene illustrations cannot start — the following scenes have no linked reference block.
        Please link a reference to each scene before starting.
      </p>
      <ul style={s.list}>
        {scenes.map((scene) => (
          <li key={scene.blockId} style={s.listItem}>
            <span style={s.blockName}>{scene.name ?? 'Unnamed scene'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
