/**
 * ReferenceBlockNode — React Flow custom node for reference blocks on the
 * Video Road Map canvas (storyboard-reference-flows T15).
 *
 * ACs: AC-03, AC-04, AC-05, AC-07, AC-11
 *
 * Conventions: mirrors MusicBlockNode.tsx (off-chain canvas block pattern).
 * Inline styles only — no CSS files.
 */

import React, { useCallback } from 'react';

import type { ReferenceBlockNodeData } from '@/features/storyboard/types';

import { referenceBlockNodeStyles as s, STATUS_COLOR } from './ReferenceBlockNode.styles';

interface ReferenceBlockNodeProps {
  id: string;
  data: ReferenceBlockNodeData;
}

function ReferenceGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ReferenceBlockNode({ id, data }: ReferenceBlockNodeProps): React.ReactElement {
  const { referenceBlock, previewUrl, onOpenFlow, onRetry, onAddBlock } = data;
  const { flowId, name, castType, windowStatus, errorMessage } = referenceBlock;

  const hasFlow = flowId !== null;

  const handleClick = useCallback((): void => {
    if (hasFlow) {
      onOpenFlow(id);
    }
  }, [id, hasFlow, onOpenFlow]);

  const handleRetry = useCallback(
    (event: React.MouseEvent): void => {
      event.stopPropagation();
      onRetry(id);
    },
    [id, onRetry],
  );

  const handleAddBlock = useCallback(
    (event: React.MouseEvent): void => {
      event.stopPropagation();
      onAddBlock?.();
    },
    [onAddBlock],
  );

  const statusColor = windowStatus !== null ? (STATUS_COLOR[windowStatus] ?? undefined) : undefined;

  return (
    <div
      style={{ ...s.root, ...(!hasFlow ? s.rootNoFlow : {}) }}
      role="button"
      tabIndex={0}
      aria-label={hasFlow ? `Open reference flow for ${name}` : name}
      data-testid="reference-block-node"
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleClick();
      }}
    >
      {/* Header */}
      <div style={s.header}>
        <span style={s.glyph}>
          <ReferenceGlyph />
        </span>
        <span style={s.title} title={name} data-testid="reference-block-name">
          {name}
        </span>
        <span style={s.typeBadge} data-testid="reference-block-type-badge">
          {castType}
        </span>
      </div>

      {/* Body */}
      <div style={s.body}>
        {/* AC-03 / AC-07 — preview or placeholder */}
        {previewUrl !== null ? (
          <img
            src={previewUrl}
            alt={name}
            style={s.preview}
            data-testid="reference-block-preview"
          />
        ) : (
          <div style={s.previewPlaceholder} data-testid="reference-block-preview-placeholder">
            No preview
          </div>
        )}

        {/* AC-04 — status badge (only when windowStatus is non-null) */}
        {windowStatus !== null && (
          <div style={s.statusRow}>
            <span
              style={{ ...s.statusBadge, color: statusColor, borderColor: statusColor }}
              data-testid="reference-block-status-badge"
            >
              {windowStatus}
            </span>

            {windowStatus === 'failed' && errorMessage !== null && (
              <p style={s.errorMessage} data-testid="reference-block-error-message">
                {errorMessage}
              </p>
            )}

            {windowStatus === 'failed' && (
              <button
                type="button"
                style={s.retryButton}
                data-testid="reference-block-retry-button"
                onClick={handleRetry}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* No-flow indicator — shown when flowId is null */}
        {!hasFlow && (
          <div style={s.noFlowBadge} data-testid="reference-block-no-flow">
            No flow linked
          </div>
        )}
      </div>

      {/* AC-11 — "Add reference block" action (US-07: manually add an entry after cast confirmation) */}
      {onAddBlock !== undefined && (
        <button
          type="button"
          style={s.addBlockButton}
          data-testid="reference-block-add-button"
          onClick={handleAddBlock}
          aria-label="Add reference block"
        >
          + Add reference block
        </button>
      )}
    </div>
  );
}
