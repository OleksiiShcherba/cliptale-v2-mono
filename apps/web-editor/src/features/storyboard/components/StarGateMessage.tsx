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
    <div
      role="alert"
      style={{
        background: '#1A0A0A',
        border: '1px solid #F87171',
        borderRadius: 8,
        padding: '16px 20px',
        color: '#F0F0FA',
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}
    >
      <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#F87171' }}>
        Scene preview cannot start — the following reference blocks need a starred result:
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {blocks.map((block) => (
          <li key={block.blockId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1 }}>{block.name}</span>
            <button
              data-testid={`star-gate-retry-${block.blockId}`}
              onClick={() => onRetryBlock(block.blockId)}
              style={{
                background: 'transparent',
                border: '1px solid #4C1D95',
                borderRadius: 6,
                color: '#A78BFA',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Retry generation
            </button>
            <button
              data-testid={`star-gate-delete-${block.blockId}`}
              onClick={() => onDeleteBlock(block.blockId)}
              style={{
                background: 'transparent',
                border: '1px solid #7F1D1D',
                borderRadius: 6,
                color: '#F87171',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Delete block
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
