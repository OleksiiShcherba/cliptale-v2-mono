import React, { useCallback, useRef, useState } from 'react';

import type { AssetSummary } from '@/features/generate-wizard/types';

import type { PromptEditorHandle } from './PromptEditor';
import { AssetPickerModal } from './AssetPickerModal';
import {
  AiEnhanceIcon,
  SpinnerIcon,
  VideoIcon,
  ImageIcon,
  AudioIcon,
} from './PromptToolbarIcons';

// ---------------------------------------------------------------------------
// Design-guide tokens (design-guide §3 — dark theme)
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const INFO = '#0EA5E9';     // Insert Video icon color
const WARNING = '#F59E0B';  // Insert Image icon color
const SUCCESS = '#10B981';  // Insert Audio icon color
const PRIMARY = '#7C3AED';  // AI Enhance button accent

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which picker modal is currently open (null = none). */
type OpenPicker = null | 'video' | 'image' | 'audio';

export interface PromptToolbarProps {
  /** Ref to the PromptEditor so `insertMediaRef` can be called on pick. */
  promptEditorRef: React.RefObject<PromptEditorHandle | null>;
  /**
   * The current generation draft ID.
   * When null the AI Enhance button is disabled — no draft to enhance yet.
   */
  draftId: string | null;
  /** True while an AI Enhance job is in-flight (queued or running). */
  isEnhancing: boolean;
  /** Called when the user clicks the AI Enhance button. */
  onEnhance: () => void;
}

// ---------------------------------------------------------------------------
// Button styles
// ---------------------------------------------------------------------------

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '32px',
  padding: '0 8px',
  background: SURFACE_ELEVATED,
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '16px',
  fontFamily: 'Inter, sans-serif',
  whiteSpace: 'nowrap' as const,
};

const buttonDisabled: React.CSSProperties = {
  ...buttonBase,
  opacity: 0.6,
  cursor: 'not-allowed',
};

// ---------------------------------------------------------------------------
// PromptToolbar
// ---------------------------------------------------------------------------

/**
 * Toolbar rendered immediately below the PromptEditor.
 *
 * Contains four buttons:
 * - AI Enhance — enabled when draftId is set and not currently enhancing.
 * - Insert Video (opens AssetPickerModal with mediaType='video')
 * - Insert Image (opens AssetPickerModal with mediaType='image')
 * - Insert Audio (opens AssetPickerModal with mediaType='audio')
 *
 * Only one picker can be open at a time.
 */
export function PromptToolbar({
  promptEditorRef,
  draftId,
  isEnhancing,
  onEnhance,
}: PromptToolbarProps): React.ReactElement {
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);

  // Refs to each insert button so focus can be restored when the modal closes.
  const videoTriggerRef = useRef<HTMLButtonElement>(null);
  const imageTriggerRef = useRef<HTMLButtonElement>(null);
  const audioTriggerRef = useRef<HTMLButtonElement>(null);

  const triggerRefMap: Record<'video' | 'image' | 'audio', React.RefObject<HTMLButtonElement | null>> = {
    video: videoTriggerRef,
    image: imageTriggerRef,
    audio: audioTriggerRef,
  };

  const handleOpenPicker = useCallback((type: 'video' | 'image' | 'audio') => {
    setOpenPicker(type);
  }, []);

  const handleClosePicker = useCallback(() => {
    setOpenPicker(null);
  }, []);

  /**
   * Called when the user picks an asset in the modal.
   * Inserts a media-ref chip into the editor and closes the modal.
   * The modal also calls onClose itself via its internal handlePick,
   * so we only need to drive insertMediaRef here.
   */
  const handlePick = useCallback(
    (asset: AssetSummary) => {
      promptEditorRef.current?.insertMediaRef({
        id: asset.id,
        type: asset.type,
        label: asset.label,
      });
    },
    [promptEditorRef],
  );

  return (
    <div style={styles.toolbar} role="toolbar" aria-label="Prompt toolbar">
      {/* AI Enhance — disabled when no draft or while job is in-flight */}
      <button
        type="button"
        disabled={draftId === null || isEnhancing}
        aria-label="AI Enhance"
        data-testid="toolbar-ai-enhance"
        onClick={onEnhance}
        style={
          draftId === null || isEnhancing
            ? { ...buttonDisabled, color: TEXT_PRIMARY }
            : { ...buttonBase, color: PRIMARY }
        }
      >
        {isEnhancing ? <SpinnerIcon /> : <AiEnhanceIcon />}
        AI Enhance
      </button>

      {/* Insert Video */}
      <button
        type="button"
        ref={videoTriggerRef}
        aria-label="Insert video"
        style={{ ...buttonBase, color: INFO }}
        onClick={() => handleOpenPicker('video')}
        data-testid="toolbar-insert-video"
      >
        <VideoIcon />
        Insert Video
      </button>

      {/* Insert Image */}
      <button
        type="button"
        ref={imageTriggerRef}
        aria-label="Insert image"
        style={{ ...buttonBase, color: WARNING }}
        onClick={() => handleOpenPicker('image')}
        data-testid="toolbar-insert-image"
      >
        <ImageIcon />
        Insert Image
      </button>

      {/* Insert Audio */}
      <button
        type="button"
        ref={audioTriggerRef}
        aria-label="Insert audio"
        style={{ ...buttonBase, color: SUCCESS }}
        onClick={() => handleOpenPicker('audio')}
        data-testid="toolbar-insert-audio"
      >
        <AudioIcon />
        Insert Audio
      </button>

      {/* Single modal mount — only one picker open at a time */}
      {openPicker !== null && (
        <AssetPickerModal
          mediaType={openPicker}
          onPick={handlePick}
          onClose={handleClosePicker}
          triggerRef={triggerRefMap[openPicker]}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  toolbar: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
  } as React.CSSProperties,
} as const;
