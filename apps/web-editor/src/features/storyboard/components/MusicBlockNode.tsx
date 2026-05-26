import React, { useCallback } from 'react';

import type { MusicBlockNodeData } from '@/features/storyboard/types';

import { SUCCESS, WARNING, ERROR, PRIMARY } from './nodeStyles';
import { musicBlockNodeStyles as s } from './MusicBlockNode.styles';

interface MusicBlockNodeProps {
  id: string;
  data: MusicBlockNodeData;
}

const STATUS_COLORS: Record<string, string> = {
  Ready: SUCCESS,
  Running: PRIMARY,
  Queued: WARNING,
  Failed: ERROR,
  Pending: WARNING,
};

function MusicGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M9.7 1.4v8.2a2 2 0 1 1-1-1.7V3.5L4.5 4.6v6.3a2 2 0 1 1-1-1.7V3.5l6.2-1.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MusicBlockNode({ id, data }: MusicBlockNodeProps): React.ReactElement {
  const { musicBlock, rangeLabel, sourceLabel, statusLabel, isActive, onEdit, onHover } = data;
  const statusColor = STATUS_COLORS[statusLabel] ?? WARNING;

  const handleEdit = useCallback((): void => {
    onEdit(id);
  }, [id, onEdit]);

  const handleMouseEnter = useCallback((): void => {
    onHover(id);
  }, [id, onHover]);

  const handleMouseLeave = useCallback((): void => {
    onHover(null);
  }, [onHover]);

  return (
    <div
      style={{ ...s.root, ...(isActive ? s.rootActive : {}) }}
      role="button"
      tabIndex={0}
      aria-label={`Edit music ${musicBlock.name}`}
      data-testid="music-block-node"
      onClick={handleEdit}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleEdit();
      }}
    >
      <div style={s.header}>
        <span style={s.glyph}>
          <MusicGlyph />
        </span>
        <span style={s.title} title={musicBlock.name} data-testid="music-block-title">
          {musicBlock.name}
        </span>
      </div>
      <div style={s.body}>
        <div style={s.metaRow}>
          <span style={s.badge} data-testid="music-source-badge">
            {sourceLabel}
          </span>
          <span
            style={{ ...s.badge, color: statusColor, borderColor: statusColor }}
            data-testid="music-status-badge"
          >
            {statusLabel}
          </span>
        </div>
        <p style={s.range} title={rangeLabel} data-testid="music-range-label">
          {rangeLabel}
        </p>
        <div style={s.previewBar} aria-hidden="true" data-testid="music-preview-affordance" />
      </div>
    </div>
  );
}
