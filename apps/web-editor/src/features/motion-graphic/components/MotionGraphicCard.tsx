/**
 * MotionGraphicCard — one gallery card (T13).
 *
 * Mirrors FlowCard (generate-ai-flow): the whole card opens the authoring view,
 * inner controls stopPropagation, rename is an inline input. Adds the
 * duration + status meta the spec lists (AC-01 / AC-13) and a Duplicate action
 * (AC-12).
 */

import React from 'react';

import type { MotionGraphicSummary } from '../types';
import {
  BORDER,
  PRIMARY,
  SURFACE_BASE,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  statusColor,
} from './motionGraphicsPage.styles';

interface MotionGraphicCardProps {
  graphic: MotionGraphicSummary;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<unknown>;
}

export function MotionGraphicCard({
  graphic,
  onOpen,
  onRename,
  onDuplicate,
}: MotionGraphicCardProps): React.ReactElement {
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState(graphic.title);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);

  function handleCardOpen(): void {
    if (isRenaming) return;
    onOpen(graphic.id);
  }

  function handleCardKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardOpen();
    }
  }

  async function handleRenameSubmit(): Promise<void> {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === graphic.title) {
      setIsRenaming(false);
      return;
    }
    await onRename(graphic.id, trimmed);
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      void handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setRenameValue(graphic.title);
      setIsRenaming(false);
    }
  }

  async function handleDuplicateClick(): Promise<void> {
    if (isDuplicating) return;
    setIsDuplicating(true);
    try {
      await onDuplicate(graphic.id);
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open motion graphic ${graphic.title}`}
      onClick={handleCardOpen}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: SURFACE_ELEVATED,
        border: `1px solid ${isHovered ? PRIMARY : BORDER}`,
        borderRadius: 8,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isRenaming ? (
          <input
            aria-label="Motion graphic title"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleRenameKeyDown}
            onBlur={() => {
              void handleRenameSubmit();
            }}
            autoFocus
            style={{
              flex: 1,
              background: SURFACE_BASE,
              color: TEXT_PRIMARY,
              border: `1px solid ${PRIMARY}`,
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 16,
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />
        ) : (
          <h3
            style={{
              flex: 1,
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              lineHeight: '20px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {graphic.title}
          </h3>
        )}
        {/* Status pill (AC-13 lists status) */}
        <span
          data-testid={`status-${graphic.id}`}
          style={{
            flexShrink: 0,
            padding: '2px 8px',
            color: statusColor(graphic.status),
            border: `1px solid ${statusColor(graphic.status)}`,
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {graphic.status}
        </span>
      </div>

      {/* Meta row — duration (AC-01 / AC-13) */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: TEXT_SECONDARY,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {graphic.durationSeconds}s · Updated {new Date(graphic.updatedAt).toLocaleString()}
      </p>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          aria-label={`Rename ${graphic.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setRenameValue(graphic.title);
            setIsRenaming(true);
          }}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: TEXT_SECONDARY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
          }}
        >
          Rename
        </button>

        <button
          type="button"
          aria-label={`Duplicate ${graphic.title}`}
          onClick={(e) => {
            e.stopPropagation();
            void handleDuplicateClick();
          }}
          disabled={isDuplicating}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: TEXT_SECONDARY,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            cursor: isDuplicating ? 'not-allowed' : 'pointer',
            opacity: isDuplicating ? 0.6 : 1,
          }}
        >
          {isDuplicating ? 'Duplicating…' : 'Duplicate'}
        </button>
      </div>
    </div>
  );
}
