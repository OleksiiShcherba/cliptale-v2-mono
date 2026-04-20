import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { deleteDraft } from '@/features/generate-wizard/api';

import type { StoryboardCardSummary, MediaPreview } from '../types';
import { restoreStoryboardDraft } from '../api';

// ── Design-guide tokens (§3 Dark Theme) ────────────────────────────────────
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
// TODO: ERROR is duplicated in several card files — consolidate into a shared token file when other tokens are centralised
const ERROR = '#EF4444';

// ── Status badge helpers ─────────────────────────────────────────────────────

type BadgeVariant = 'warning' | 'success' | 'text-secondary';

/** Maps a draft status to its design-guide badge color variant. */
function getBadgeVariant(status: StoryboardCardSummary['status']): BadgeVariant {
  if (status === 'step2' || status === 'step3') return 'warning';
  if (status === 'completed') return 'success';
  return 'text-secondary';
}

/** Returns the CSS color for a badge variant. */
function getBadgeColor(variant: BadgeVariant): string {
  if (variant === 'warning') return WARNING;
  if (variant === 'success') return SUCCESS;
  return TEXT_SECONDARY;
}

/** Human-readable label for a status value. */
function getStatusLabel(status: StoryboardCardSummary['status']): string {
  if (status === 'draft') return 'Draft';
  if (status === 'step2') return 'In Progress';
  if (status === 'step3') return 'In Progress';
  return 'Completed';
}

// ── Media preview thumb ──────────────────────────────────────────────────────

/** Placeholder SVG rendered when thumbnailUrl is null for a media preview. */
function MediaThumbPlaceholder(): React.ReactElement {
  return (
    <svg
      aria-label="No preview"
      role="img"
      width="56"
      height="56"
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="56" height="56" fill="#252535" rx="4" />
      <rect x="20" y="17" width="16" height="12" rx="2" fill="#8A8AA0" opacity="0.4" />
      <polygon points="24,19 32,23 24,27" fill="#8A8AA0" opacity="0.7" />
    </svg>
  );
}

interface MediaThumbProps {
  preview: MediaPreview;
}

function MediaThumb({ preview }: MediaThumbProps): React.ReactElement {
  if (preview.thumbnailUrl == null) {
    return <MediaThumbPlaceholder />;
  }
  return (
    <img
      src={preview.thumbnailUrl}
      alt={`Preview for ${preview.fileId}`}
      style={{
        width: 56,
        height: 56,
        borderRadius: 4,
        objectFit: 'cover',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}

// ── StoryboardCard ───────────────────────────────────────────────────────────

interface StoryboardCardProps {
  card: StoryboardCardSummary;
  /**
   * Optional callback invoked after a successful soft-delete of the draft,
   * allowing a parent to show the undo toast.
   */
  onShowUndoToast?: (label: string, onUndo: () => Promise<void>) => void;
}

/**
 * Card component for a single storyboard draft in the Storyboard panel.
 *
 * Renders status badge, truncated text preview (140 chars, 2 lines),
 * media preview row (max 3 thumbs), and a Resume button.
 * Clicking anywhere on the card (or Resume) navigates to
 * /generate?draftId=<draftId>.
 */
export function StoryboardCard({ card, onShowUndoToast }: StoryboardCardProps): React.ReactElement | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  function handleResume(): void {
    navigate(`/generate?draftId=${card.draftId}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/generate?draftId=${card.draftId}`);
    }
  }

  async function handleDelete(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const draftId = card.draftId;
      await deleteDraft(draftId);
      // Optimistically hide the card; invalidate after undo window
      setIsVisible(false);
      void queryClient.invalidateQueries({ queryKey: ['home', 'storyboards'] });
      onShowUndoToast?.(
        `Storyboard deleted`,
        async () => {
          await restoreStoryboardDraft(draftId);
          setIsVisible(true);
          void queryClient.invalidateQueries({ queryKey: ['home', 'storyboards'] });
        },
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const badgeVariant = getBadgeVariant(card.status);
  const badgeColor = getBadgeColor(badgeVariant);
  const statusLabel = getStatusLabel(card.status);

  // Text preview: trim at 140 chars; CSS line-clamp handles visual truncation
  const preview =
    card.textPreview != null && card.textPreview.length > 140
      ? card.textPreview.slice(0, 140)
      : (card.textPreview ?? '');

  if (!isVisible) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Resume storyboard: ${preview.slice(0, 40) || 'Untitled'}`}
      onClick={handleResume}
      onKeyDown={handleKeyDown}
      style={{
        background: SURFACE_ELEVATED,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row: status badge */}
      <div
        style={{
          padding: '12px 16px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          data-testid="status-badge"
          data-status={card.status}
          style={{
            fontSize: 11,
            fontWeight: 400,
            lineHeight: '16px',
            color: badgeColor,
            fontFamily: 'Inter, sans-serif',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Text preview — max 2 lines via line-clamp */}
      <div style={{ padding: '8px 16px 0' }}>
        {preview.length > 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 400,
              lineHeight: '20px',
              color: TEXT_PRIMARY,
              fontFamily: 'Inter, sans-serif',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {preview}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 400,
              lineHeight: '20px',
              color: TEXT_SECONDARY,
              fontFamily: 'Inter, sans-serif',
              fontStyle: 'italic',
            }}
          >
            No description
          </p>
        )}
      </div>

      {/* Media preview row — max 3 thumbnails (backend-capped) */}
      {card.mediaPreviews.length > 0 && (
        <div
          style={{
            padding: '8px 16px 0',
            display: 'flex',
            gap: 8,
            flexWrap: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {card.mediaPreviews.slice(0, 3).map((preview) => (
            <MediaThumb key={preview.fileId} preview={preview} />
          ))}
        </div>
      )}

      {/* Footer: Delete + Resume buttons */}
      <div
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Delete storyboard draft"
          onClick={(e) => { void handleDelete(e); }}
          disabled={isDeleting}
          style={{
            padding: '4px 12px',
            background: 'transparent',
            color: ERROR,
            border: `1px solid ${ERROR}`,
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            lineHeight: '16px',
            cursor: isDeleting ? 'not-allowed' : 'pointer',
            opacity: isDeleting ? 0.6 : 1,
          }}
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          aria-label={`Resume storyboard draft`}
          onClick={handleResume}
          style={{
            padding: '8px 12px',
            background: PRIMARY,
            color: TEXT_PRIMARY,
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'Inter, sans-serif',
            lineHeight: '16px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = PRIMARY_DARK;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = PRIMARY;
          }}
        >
          Resume
        </button>
      </div>
    </div>
  );
}
