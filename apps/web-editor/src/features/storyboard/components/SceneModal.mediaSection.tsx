import React, { useRef, useState } from 'react';

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
import { SceneModalMediaPreview } from './SceneModal.mediaPreview';
import { MotionGraphicBlockMediaPicker } from './MotionGraphicBlockMediaPicker';
import type { ModalMediaItem, BlockMediaKind } from './SceneModal.types';
import type { BlockMediaMotionGraphic } from '@/features/motion-graphic/types';
import { MotionGraphicPlayer } from '@/features/motion-graphic/runtime';

const MAX_MEDIA_ITEMS = 6;

const MEDIA_TYPE_OPTIONS: { kind: AssetKind; label: string }[] = [
  { kind: 'image', label: 'Image' },
  { kind: 'video', label: 'Video' },
  { kind: 'audio', label: 'Audio' },
];

const BADGE_COLORS: Record<BlockMediaKind, string> = {
  image: '#0EA5E9',
  video: '#7C3AED',
  audio: '#10B981',
  motion_graphic: '#F59E0B',
};

const MEDIA_BADGE_LABELS: Record<BlockMediaKind, string> = {
  image: 'IMAGE CLIP',
  video: 'VIDEO CLIP',
  audio: 'AUDIO CLIP',
  motion_graphic: 'MOTION GRAPHIC',
};

/** Compact inline preview frame for a persisted motion graphic (AC-04/US-07). */
const motionGraphicPreviewStyle: React.CSSProperties = {
  width: '52px',
  height: '40px',
  borderRadius: '6px',
  overflow: 'hidden',
  flexShrink: 0,
  border: `1px solid ${BORDER}`,
  background: SURFACE_ALT,
};

const mediaItemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
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
  alignSelf: 'flex-start',
  fontFamily: 'Inter, sans-serif',
});

const mediaDetailsStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const fileNameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
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

interface SceneModalMediaSectionProps {
  items: ModalMediaItem[];
  onAdd: (item: ModalMediaItem) => void;
  onRemove: (index: number) => void;
  uploadDraftId?: string;
  /**
   * When provided alongside a blockId, the picker offers a "Motion Graphic"
   * media kind that attaches a ready graphic to the block server-side (AC-04).
   */
  draftId?: string;
  blockId?: string;
  /** Fired with the new block-media row once a motion graphic is attached. */
  onAttachMotionGraphic?: (row: BlockMediaMotionGraphic) => void;
}

export function SceneModalMediaSection({
  items,
  onAdd,
  onRemove,
  uploadDraftId,
  draftId,
  blockId,
  onAttachMotionGraphic,
}: SceneModalMediaSectionProps): React.ReactElement {
  const uploadTarget: UploadTarget | undefined = uploadDraftId
    ? { kind: 'draft', draftId: uploadDraftId }
    : undefined;
  const canAttachMotionGraphic = Boolean(draftId && blockId);
  const [pickerKind, setPickerKind] = useState<AssetKind | null>(null);
  const [showMotionGraphicPicker, setShowMotionGraphicPicker] = useState(false);
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

  const handlePickMotionGraphic = (): void => {
    setShowTypePicker(false);
    setShowMotionGraphicPicker(true);
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
              {item.mediaType === 'motion_graphic' && item.motionGraphic ? (
                <div
                  style={motionGraphicPreviewStyle}
                  data-testid="persisted-motion-graphic-preview"
                >
                  <MotionGraphicPlayer
                    code={item.motionGraphic.code}
                    geometry={{
                      durationSeconds: item.motionGraphic.durationSeconds,
                      fps: item.motionGraphic.fps,
                      width: item.motionGraphic.width,
                      height: item.motionGraphic.height,
                    }}
                  />
                </div>
              ) : (
                <SceneModalMediaPreview item={item} />
              )}
              <span style={mediaDetailsStyle}>
                <span style={badgeStyle(BADGE_COLORS[item.mediaType])} data-testid="media-badge">
                  {MEDIA_BADGE_LABELS[item.mediaType]}
                </span>
                <span style={fileNameStyle} title={item.filename}>
                  {item.filename}
                </span>
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
            {canAttachMotionGraphic && (
              <button
                type="button"
                style={typeChipStyle}
                onClick={handlePickMotionGraphic}
                data-testid="type-chip-motion_graphic"
              >
                Motion Graphic
              </button>
            )}
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

      {showMotionGraphicPicker && draftId && blockId && (
        <MotionGraphicBlockMediaPicker
          draftId={draftId}
          blockId={blockId}
          onAttached={(row) => {
            onAttachMotionGraphic?.(row);
          }}
          onClose={() => setShowMotionGraphicPicker(false)}
        />
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
          onClose={() => setPickerKind(null)}
          triggerRef={addButtonRef}
          uploadTarget={uploadTarget}
        />
      )}
    </section>
  );
}
