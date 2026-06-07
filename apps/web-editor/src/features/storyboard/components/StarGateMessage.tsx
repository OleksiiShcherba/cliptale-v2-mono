/**
 * StarGateMessage — displays the star-gate failure notice (storyboard-reference-flows T20, AC-08).
 *
 * AC-08: when at least one reference block has no starred result and the Creator
 * attempts to start the full scene-preview set, the system blocks the start and
 * names, in plain language, exactly which blocks still need a starred result.
 *
 * Each listed block offers two exit actions:
 *  - Retry generation (onRetryBlock)
 *  - Delete block (onDeleteBlock)
 *
 * Renders nothing when the blocks list is empty (gate passed).
 */

import React from 'react';

import { starGateMessageStyles as s } from './StarGateMessage.styles';

export interface StarGateBlock {
  blockId: string;
  name: string;
}

export interface StarGateMessageProps {
  blocks: StarGateBlock[];
  onRetryBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
}

export function StarGateMessage({
  blocks,
  onRetryBlock,
  onDeleteBlock,
}: StarGateMessageProps): React.ReactElement | null {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div role="alert" style={s.root}>
      <p style={s.heading}>
        Scene preview cannot start — the following reference blocks need a starred result:
      </p>
      <ul style={s.list}>
        {blocks.map((block) => (
          <li key={block.blockId} style={s.listItem}>
            <span style={s.blockName}>{block.name}</span>
            <button
              data-testid={`star-gate-retry-${block.blockId}`}
              onClick={() => onRetryBlock(block.blockId)}
              style={s.retryButton}
            >
              Retry generation
            </button>
            <button
              data-testid={`star-gate-delete-${block.blockId}`}
              onClick={() => onDeleteBlock(block.blockId)}
              style={s.deleteButton}
            >
              Delete block
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
