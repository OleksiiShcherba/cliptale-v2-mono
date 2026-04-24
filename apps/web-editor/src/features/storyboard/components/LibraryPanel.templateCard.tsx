/**
 * LibraryPanel.templateCard — a single template card in the Library sidebar.
 *
 * Shows up to 3 image/video thumbnail previews via buildAuthenticatedUrl(),
 * the template name, media type badges, and action buttons:
 *   - Edit   → opens SceneModal in template-edit mode
 *   - Delete → soft-deletes via API + refreshes list
 *   - Add    → calls add-to-storyboard API + inserts block into canvas
 *
 * Extracted from LibraryPanel.tsx to keep that file under the 300-line cap.
 */

import React, { useState } from 'react';

import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

import type { SceneTemplate } from '../types';
import {
  addButtonStyle,
  cardActionButtonStyle,
  cardActionsStyle,
  cardBadgesRowStyle,
  cardBodyStyle,
  cardMetaRowStyle,
  cardNameStyle,
  cardStyle,
  cardThumbnailRowStyle,
  deleteButtonStyle,
  mediaBadgeStyle,
  thumbnailImgStyle,
  thumbnailPlaceholderStyle,
  thumbnailStyle,
} from './LibraryPanel.styles';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_THUMBNAILS = 3;

const MEDIA_BADGE_LABELS: Record<string, string> = {
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
};

// ── Placeholder SVG ────────────────────────────────────────────────────────────

function PlaceholderThumb(): React.ReactElement {
  return (
    <div style={thumbnailPlaceholderStyle} aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="#5A5A70" strokeWidth="1.5" />
        <circle cx="8.5" cy="8.5" r="2" fill="#5A5A70" />
        <path d="M3 16l4-4 3 3 3-3 5 5" stroke="#5A5A70" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface TemplateCardProps {
  template: SceneTemplate;
  onEdit: (template: SceneTemplate) => void;
  onDelete: (templateId: string) => void;
  onAddToStoryboard: (templateId: string) => void;
  /** True while the add-to-storyboard operation is in flight for this card. */
  isAdding?: boolean;
}

// ── TemplateCard ───────────────────────────────────────────────────────────────

/**
 * A single scene template card in the Library panel.
 */
export function TemplateCard({
  template,
  onEdit,
  onDelete,
  onAddToStoryboard,
  isAdding = false,
}: TemplateCardProps): React.ReactElement {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Collect up to MAX_THUMBNAILS visual items (image/video only)
  const visualItems = template.mediaItems
    .filter((m) => m.mediaType === 'image' || m.mediaType === 'video')
    .slice(0, MAX_THUMBNAILS);

  // Unique media types for badge rendering
  const uniqueTypes = Array.from(new Set(template.mediaItems.map((m) => m.mediaType)));

  const thumbnails = Array.from({ length: MAX_THUMBNAILS }, (_, i) => {
    const item = visualItems[i];
    if (item) {
      const url = buildAuthenticatedUrl(
        `${config.apiBaseUrl}/assets/${item.fileId}/thumbnail`,
      );
      return (
        <div key={item.fileId} style={thumbnailStyle}>
          <img
            src={url}
            alt=""
            style={thumbnailImgStyle}
            aria-hidden="true"
            data-testid={`template-thumb-${template.id}-${i}`}
          />
        </div>
      );
    }
    return (
      <div key={`placeholder-${i}`} style={thumbnailStyle}>
        <PlaceholderThumb />
      </div>
    );
  });

  const handleEdit = (): void => { onEdit(template); };

  const handleDeleteClick = (): void => {
    if (confirmDelete) {
      onDelete(template.id);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleAdd = (): void => { onAddToStoryboard(template.id); };

  return (
    <div
      style={cardStyle}
      data-testid={`template-card-${template.id}`}
      aria-label={`Scene template: ${template.name}`}
    >
      {/* Thumbnail strip */}
      <div style={cardThumbnailRowStyle} aria-hidden="true">
        {thumbnails}
      </div>

      {/* Card body */}
      <div style={cardBodyStyle}>
        <span style={cardNameStyle} title={template.name}>
          {template.name}
        </span>

        <div style={cardMetaRowStyle}>
          {/* Media type badges */}
          <div style={cardBadgesRowStyle}>
            {uniqueTypes.map((type) => (
              <span key={type} style={mediaBadgeStyle} data-testid={`badge-${type}-${template.id}`}>
                {MEDIA_BADGE_LABELS[type] ?? type.toUpperCase()}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div style={cardActionsStyle}>
            <button
              type="button"
              style={cardActionButtonStyle}
              onClick={handleEdit}
              aria-label={`Edit template ${template.name}`}
              data-testid={`edit-template-${template.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              style={deleteButtonStyle}
              onClick={handleDeleteClick}
              aria-label={confirmDelete ? 'Confirm delete' : `Delete template ${template.name}`}
              data-testid={`delete-template-${template.id}`}
            >
              {confirmDelete ? 'Confirm' : 'Del'}
            </button>
            <button
              type="button"
              style={addButtonStyle}
              onClick={handleAdd}
              disabled={isAdding}
              aria-label={`Add template ${template.name} to storyboard`}
              data-testid={`add-template-${template.id}`}
            >
              {isAdding ? '…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
