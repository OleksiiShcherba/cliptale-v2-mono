/**
 * SceneModal.mediaSection — Media list section for SceneModal.
 *
 * Renders:
 * - List of added media items with type badge + filename + remove button
 * - "+ Add Media" button that opens AssetPickerModal (cycles image → video → audio)
 * - Max 6 items enforced with a toast-style warning
 */

import React, { useState, useRef } from 'react';

import { AssetPickerModal } from '@/features/generate-wizard/components/AssetPickerModal';
import type { AssetKind, AssetSummary } from '@/features/generate-wizard/types';
import type { UploadTarget } from '@/shared/file-upload/types';

import {
  BORDER,
  ERROR,
  PRIMARY,
  SURFACE,
  SURFACE_ALT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  sectionLabelStyle,
} from './SceneModal.styles';
import type { ModalMediaItem } from './SceneModal.types';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_MEDIA_ITEMS = 6;

const MEDIA_TYPE_OPTIONS: { kind: AssetKind; label: string }[] = [
  { kind: 'image', label: 'Image' },
  { kind: 'video', label: 'Video' },
  { kind: 'audio', label: 'Audio' },
];

const BADGE_COLORS: Record<AssetKind, string> = {
  image: '#0EA5E9',
  video: '#7C3AED',
  audio: '#10B981',
};

const MEDIA_BADGE_LABELS: Record<AssetKind, string> = {
  image: 'IMAGE CLIP',
  video: 'VIDEO CLIP',
  audio: 'AUDIO CLIP',
};

// ── Sub-styles ─────────────────────────────────────────────────────────────────

const mediaItemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  background: SURFACE,
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
};

const mediaListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const badgeStyle = (color: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 500,
  color,
  border: `1px solid ${color}`,
  borderRadius: '4px',
  padding: '4px 8px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  flexShrink: 0,
  fontFamily: 'Inter, sans-serif',
});

const fileNameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const removeItemButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '2px',
  cursor: 'pointer',
  color: ERROR,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const addMediaButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px dashed ${BORDER}`,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 500,
  color: PRIMARY,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

const typePickerRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const typeChipStyle: React.CSSProperties = {
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: TEXT_PRIMARY,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

const warningBoxStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(239,68,68,0.1)',
  border: `1px solid ${ERROR}`,
  borderRadius: '8px',
  color: ERROR,
  fontSize: '12px',
  fontWeight: 400,
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface SceneModalMediaSectionProps {
  items: ModalMediaItem[];
  onAdd: (item: ModalMediaItem) => void;
  onRemove: (index: number) => void;
  /** When provided, the AssetPickerModal will render an upload affordance. */
  uploadDraftId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Media section rendered inside SceneModal.
 * Handles the picker flow and enforces the max-6 item limit.
 */
export function SceneModalMediaSection({
  items,
  onAdd,
  onRemove,
  uploadDraftId,
}: SceneModalMediaSectionProps): React.ReactElement {
  const uploadTarget: UploadTarget | undefined = uploadDraftId
    ? { kind: 'draft', draftId: uploadDraftId }
    : undefined;
  const [pickerKind, setPickerKind] = useState<AssetKind | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showMaxWarning, setShowMaxWarning] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleAddClick = (): void => {
    if (items.length >= MAX_MEDIA_ITEMS) {
      setShowMaxWarning(true);
      return;
    }
    setShowMaxWarning(false);
    setShowTypePicker(true);
  };

  const handlePickType = (kind: AssetKind): void => {
    setShowTypePicker(false);
    setPickerKind(kind);
  };

  const handlePick = (asset: AssetSummary): void => {
    const kind = pickerKind as AssetKind;
    onAdd({
      fileId: asset.id,
      mediaType: kind,
      filename: asset.label,
      sortOrder: items.length,
    });
    setPickerKind(null);
  };

  const handlePickerClose = (): void => {
    setPickerKind(null);
  };

  return (
    <section aria-label="Media items">
      <p style={sectionLabelStyle}>Media</p>

      {showMaxWarning && (
        <div style={warningBoxStyle} role="alert" data-testid="max-media-warning">
          Maximum {MAX_MEDIA_ITEMS} media items allowed.
        </div>
      )}

      {items.length > 0 && (
        <div style={mediaListStyle} data-testid="media-list">
          {items.map((item, idx) => (
            <div key={`${item.fileId}-${idx}`} style={mediaItemRowStyle} data-testid="media-item-row">
              <span
                style={badgeStyle(BADGE_COLORS[item.mediaType])}
                data-testid="media-badge"
              >
                {MEDIA_BADGE_LABELS[item.mediaType]}
              </span>
              <span style={fileNameStyle} title={item.filename}>
                {item.filename}
              </span>
              <button
                type="button"
                style={removeItemButtonStyle}
                onClick={() => onRemove(idx)}
                aria-label={`Remove ${item.filename}`}
                data-testid="media-remove-button"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showTypePicker && (
        <div style={{ marginTop: '8px' }}>
          <p style={{ ...fileNameStyle, marginBottom: '8px' }}>Select media type:</p>
          <div style={typePickerRowStyle} data-testid="type-picker">
            {MEDIA_TYPE_OPTIONS.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                style={typeChipStyle}
                onClick={() => handlePickType(kind)}
                data-testid={`type-chip-${kind}`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              style={{ ...typeChipStyle, color: TEXT_SECONDARY }}
              onClick={() => setShowTypePicker(false)}
              data-testid="type-chip-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        ref={addButtonRef}
        type="button"
        style={{ ...addMediaButtonStyle, marginTop: items.length > 0 || showTypePicker ? '8px' : '0' }}
        onClick={handleAddClick}
        disabled={items.length >= MAX_MEDIA_ITEMS}
        aria-label="Add media item"
        data-testid="add-media-button"
      >
        + Add Media
      </button>

      {pickerKind !== null && (
        <AssetPickerModal
          mediaType={pickerKind}
          onPick={handlePick}
          onClose={handlePickerClose}
          triggerRef={addButtonRef}
          uploadTarget={uploadTarget}
        />
      )}
    </section>
  );
}
