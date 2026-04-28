/**
 * SceneModal — Scene Detail Modal for the Storyboard Editor.
 *
 * Two modes:
 *  - mode='block'    : edit a canvas scene block; Save → storyboard-store updateBlock;
 *                      Delete → storyboard-store removeBlock.
 *  - mode='template' : create/edit a library scene template; Save → API call
 *                      (handled by parent via onSave callback).
 *
 * Sub-components (extracted to stay under the 300-line cap):
 *  - SceneModal.formFields.tsx — Name, Prompt, Duration fields
 *  - SceneModal.mediaSection.tsx — Media list + "+ Add Media" picker
 *  - SceneModal.styleSection.tsx — STORYBOARD_STYLES cards + Animation stub
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

import type { ModalMediaItem, SceneModalProps, SceneModalSavePayload } from './SceneModal.types';
import {
  backdropStyle,
  bodyStyle,
  cancelButtonStyle,
  closeButtonStyle,
  deleteButtonStyle,
  dialogStyle,
  footerStyle,
  headerStyle,
  headerTitleStyle,
  saveButtonStyle,
} from './SceneModal.styles';
import { SceneModalFormFields } from './SceneModal.formFields';
import { SceneModalMediaSection } from './SceneModal.mediaSection';
import { SceneModalStyleSection } from './SceneModal.styleSection';

// ── Close icon ─────────────────────────────────────────────────────────────────

function CloseIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Converts a block's mediaItems to modal-local ModalMediaItem shape. */
function blockMediaToModal(
  mediaItems: Array<{ id: string; fileId: string; mediaType: 'image' | 'video' | 'audio'; sortOrder: number }>,
): ModalMediaItem[] {
  return mediaItems.map((m) => ({
    fileId: m.fileId,
    mediaType: m.mediaType,
    filename: m.fileId, // filename not stored on block; fall back to fileId
    sortOrder: m.sortOrder,
  }));
}

// ── SceneModal ─────────────────────────────────────────────────────────────────

/**
 * Scene Detail Modal. Supports block-edit and template-edit modes.
 * The parent renders this conditionally and provides onClose to dismiss it.
 */
export function SceneModal(props: SceneModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ── Initial values ───────────────────────────────────────────────────────────

  const isBlock = props.mode === 'block';

  const [name, setName] = useState<string>(
    isBlock ? (props.block.name ?? '') : (props.initialValues?.name ?? ''),
  );
  const [prompt, setPrompt] = useState<string>(
    isBlock ? (props.block.prompt ?? '') : (props.initialValues?.prompt ?? ''),
  );
  const [duration, setDuration] = useState<number>(
    isBlock ? props.block.durationS : (props.initialValues?.durationS ?? 10),
  );
  const [selectedStyle, setSelectedStyle] = useState<string | null>(
    isBlock ? props.block.style : (props.initialValues?.style ?? null),
  );
  const [mediaItems, setMediaItems] = useState<ModalMediaItem[]>(
    isBlock ? blockMediaToModal(props.block.mediaItems) : (props.initialValues?.mediaItems ?? []),
  );
  const [promptError, setPromptError] = useState<string>('');
  const [durationError, setDurationError] = useState<string>('');

  // ── Focus on mount ───────────────────────────────────────────────────────────

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // ── Keyboard / backdrop ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') { e.stopPropagation(); props.onClose(); }
    },
    [props.onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) props.onClose();
    },
    [props.onClose],
  );

  // ── Media handlers ───────────────────────────────────────────────────────────

  const handleAddMedia = useCallback((item: ModalMediaItem): void => {
    setMediaItems((prev) => [...prev, { ...item, sortOrder: prev.length }]);
  }, []);

  const handleRemoveMedia = useCallback((index: number): void => {
    setMediaItems((prev) =>
      prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, sortOrder: i })),
    );
  }, []);

  // ── Validation ───────────────────────────────────────────────────────────────

  function validate(): boolean {
    let valid = true;
    if (!prompt.trim()) { setPromptError('Prompt is required.'); valid = false; }
    else setPromptError('');
    if (duration < 1 || duration > 180 || !Number.isFinite(duration)) {
      setDurationError('Duration must be between 1 and 180 seconds.');
      valid = false;
    } else setDurationError('');
    return valid;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = useCallback((): void => {
    if (!validate()) return;
    const payload: SceneModalSavePayload = {
      name: name.trim(),
      prompt: prompt.trim(),
      durationS: duration,
      style: selectedStyle,
      mediaItems,
    };
    if (props.mode === 'block') props.onSave(props.block.id, payload);
    else props.onSave(payload);
    props.onClose();
  }, [name, prompt, duration, selectedStyle, mediaItems, props]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = useCallback((): void => {
    if (props.mode === 'block') { props.onDelete(props.block.id); props.onClose(); }
  }, [props]);

  const titleLabel = isBlock ? 'Edit Scene' : 'Scene Template';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={backdropStyle} onClick={handleBackdropClick} data-testid="scene-modal-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={titleLabel}
        style={dialogStyle}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        data-testid="scene-modal"
      >
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={headerTitleStyle}>{titleLabel}</h2>
          <button type="button" style={closeButtonStyle} onClick={props.onClose} aria-label="Close modal" data-testid="modal-close-button">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          <SceneModalFormFields
            name={name}
            prompt={prompt}
            duration={duration}
            promptError={promptError}
            durationError={durationError}
            onNameChange={setName}
            onPromptChange={setPrompt}
            onDurationChange={setDuration}
          />

          <SceneModalMediaSection
            items={mediaItems}
            onAdd={handleAddMedia}
            onRemove={handleRemoveMedia}
            uploadDraftId={props.mode === 'block' ? props.uploadDraftId : undefined}
          />

          <SceneModalStyleSection
            selectedStyle={selectedStyle}
            onSelect={setSelectedStyle}
          />
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <div>
            {props.mode === 'block' && (
              <button type="button" style={deleteButtonStyle} onClick={handleDelete} aria-label="Delete scene" data-testid="delete-scene-button">
                Delete scene
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={cancelButtonStyle} onClick={props.onClose} aria-label="Cancel" data-testid="cancel-button">
              Cancel
            </button>
            <button type="button" style={saveButtonStyle} onClick={handleSave} aria-label="Save scene" data-testid="save-button">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
