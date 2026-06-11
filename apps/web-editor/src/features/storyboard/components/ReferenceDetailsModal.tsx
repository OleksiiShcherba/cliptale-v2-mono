/**
 * ReferenceDetailsModal — details dialog for a confirmed reference block.
 *
 * Opens on reference-block click (the flow page moved to the explicit
 * "View flow" button). Shows:
 *   - which scenes the reference is connected to — ADJUSTABLE in place via the
 *     same SceneLinkSelector chips (persisted through PUT .../scene-links with
 *     the block's compare-and-set version);
 *   - the prompt used for generation — VIEW ONLY (description, else name —
 *     mirrors the server's buildReferencePrompt);
 *   - a "View flow" action that opens the linked generate-ai flow.
 *
 * Reuses the cast-confirm modal styles (Music-modal language: panel / header /
 * body / footer, storyboardPageStyles tokens).
 */

import React, { useEffect, useRef } from 'react';

import type { StoryboardBlock, StoryboardReferenceBlock } from '@/features/storyboard/types';
import { SceneLinkSelector } from './SceneLinkSelector';
import { castConfirmModalStyles as styles } from './CastConfirmModal.styles';

export type ReferenceDetailsModalProps = {
  referenceBlock: StoryboardReferenceBlock;
  /** Scene ids currently linked to this reference. */
  sceneBlockIds: string[];
  /** All scene blocks of the draft in story order (for the selector). */
  orderedScenes: StoryboardBlock[];
  /**
   * Persists the replacement scene-link list (PUT scene-links). Resolves with
   * the authoritative list + bumped version; throws status=409 on conflict.
   */
  onSaveSceneLinks: (
    sceneBlockIds: string[],
    version: number,
  ) => Promise<{ sceneBlockIds: string[]; version: number }>;
  /** Opens the linked generate-ai flow (the old default click behaviour). */
  onViewFlow: () => void;
  onClose: () => void;
};

export function ReferenceDetailsModal({
  referenceBlock,
  sceneBlockIds,
  orderedScenes,
  onSaveSceneLinks,
  onViewFlow,
  onClose,
}: ReferenceDetailsModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null);

  // Focus-on-mount so Esc works immediately (same idiom as CastModalShell).
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Mirrors the server's buildReferencePrompt: description, else the name.
  const promptUsed = referenceBlock.description?.trim() || referenceBlock.name;

  return (
    <div
      data-testid="reference-details-backdrop"
      style={styles.backdrop}
      role="presentation"
      onClick={handleBackdropClick}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Reference details for ${referenceBlock.name}`}
        tabIndex={-1}
        ref={dialogRef}
        style={styles.panel}
        onKeyDown={handleKeyDown}
        data-testid="reference-details-modal"
      >
        <header style={styles.header}>
          <div style={styles.titleGroup}>
            <h2 style={styles.title}>{referenceBlock.name}</h2>
            <span style={styles.subtitle}>{referenceBlock.castType} reference</span>
          </div>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close reference details"
            data-testid="reference-details-close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div style={styles.body}>
          {/* Used in scenes — adjustable */}
          <div style={styles.field}>
            <label style={styles.label}>Used in scenes</label>
            <div data-testid="reference-details-scene-links">
              <SceneLinkSelector
                blockId={referenceBlock.id}
                orderedScenes={orderedScenes}
                linkedSceneIds={sceneBlockIds}
                version={referenceBlock.version}
                onSave={onSaveSceneLinks}
              />
            </div>
          </div>

          {/* Prompt used — view only */}
          <div style={styles.field}>
            <label style={styles.label}>Prompt used</label>
            <p style={styles.message} data-testid="reference-details-prompt">
              {promptUsed}
            </p>
          </div>
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            data-testid="reference-details-close-button"
            onClick={onClose}
            style={styles.secondaryButton}
          >
            Close
          </button>
          {referenceBlock.flowId !== null && (
            <button
              type="button"
              data-testid="reference-details-view-flow"
              onClick={onViewFlow}
              style={styles.primaryButton}
            >
              View flow
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
