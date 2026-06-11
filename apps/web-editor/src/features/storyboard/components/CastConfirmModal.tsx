/**
 * CastConfirmModal — T17, AC-01, AC-01b, AC-02, AC-03.
 *
 * Presents the cast extraction proposal for review and in-place correction
 * before the Creator confirms and triggers reference generation.
 */

import React, { useState, useEffect, useRef } from 'react';

import type { StoryboardBlock } from '@/features/storyboard/types';
import { SceneLinkSelector } from './SceneLinkSelector';
import { castConfirmModalStyles } from './CastConfirmModal.styles';

// ---------------------------------------------------------------------------
// Types (mirroring openapi.yaml CastProposalEntry + CastExtractionJob shapes)
// ---------------------------------------------------------------------------

export type CastProposalEntry = {
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  imageFileIds: string[];
  sceneBlockIds: string[];
  perRunEstimate: number;
};

export type CastExtractionStatus = 'queued' | 'running' | 'completed' | 'failed';

export type CastExtractionJob = {
  jobId: string;
  draftId: string;
  status: CastExtractionStatus;
  proposal: CastProposalEntry[] | null;
  aggregateEstimateCredits: number | null;
  errorMessage: string | null;
  /**
   * Whether the proposal was truncated to the cast size limit (AC-02).
   * Populated by the server when more candidates existed than the limit
   * (openapi.yaml CastExtractionJob.truncated).
   */
  truncated?: boolean;
};

export type CastConfirmModalProps = {
  orderedScenes: StoryboardBlock[];
  extraction: CastExtractionJob | null;
  hasExistingBlocks: boolean;
  onConfirmCast: (
    entries: CastProposalEntry[],
    acknowledgedAggregateCredits: number,
  ) => Promise<void>;
  onCancel: () => void;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type EntryEditorProps = {
  entry: CastProposalEntry;
  index: number;
  orderedScenes: StoryboardBlock[];
  onChange: (index: number, updated: CastProposalEntry) => void;
};

function EntryEditor({ entry, index, orderedScenes, onChange }: EntryEditorProps) {
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(index, { ...entry, name: e.target.value });
  }

  function handleDescChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(index, { ...entry, description: e.target.value });
  }

  /**
   * SceneLinkSelector.onSave adapter for the proposal context.
   * In the proposal there is no persisted block yet — we update local state
   * directly and return a resolved response so the selector resets cleanly.
   */
  async function handleSceneLinkSave(
    sceneBlockIds: string[],
    version: number,
  ): Promise<{ sceneBlockIds: string[]; version: number }> {
    onChange(index, { ...entry, sceneBlockIds });
    return { sceneBlockIds, version };
  }

  return (
    <div data-testid={`cast-entry-${index}`} style={castConfirmModalStyles.entryEditor}>
      <div>
        <label>Name</label>
        <input
          data-testid={`cast-entry-name-${index}`}
          value={entry.name}
          onChange={handleNameChange}
          aria-label={entry.name}
        />
        <span>{entry.name}</span>
      </div>
      <div>
        <label>Type</label>
        <span>{entry.castType}</span>
      </div>
      <div>
        <label>Description</label>
        <textarea
          data-testid={`cast-entry-description-${index}`}
          value={entry.description ?? ''}
          onChange={handleDescChange}
        />
      </div>
      {/* AC-01 / AC-10: scene links correctable in place via the same multi-select selector */}
      <div data-testid={`cast-entry-scene-links-${index}`}>
        <SceneLinkSelector
          blockId={`proposal-entry-${index}`}
          orderedScenes={orderedScenes}
          linkedSceneIds={entry.sceneBlockIds}
          version={1}
          onSave={handleSceneLinkSave}
        />
      </div>
      <div>
        {entry.imageFileIds.map((fileId) => (
          <img
            key={fileId}
            data-testid={`cast-entry-image-${fileId}`}
            alt={fileId}
            src=""
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell (AC-02)
// ---------------------------------------------------------------------------

/**
 * CastModalShell — the single backdrop + centered dialog wrapper every modal
 * state renders inside (AC-02). Provides focus-on-mount, Esc-to-close, and
 * backdrop-click-to-close so no branch can render loose inline buttons in the
 * page body (0 stray-buttons).
 */
function CastModalShell({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus-on-mount: move keyboard focus into the dialog so Esc works and the
  // background is logically inert.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  }

  // Only a click on the backdrop itself (not bubbled from the dialog body)
  // dismisses — guards against accidental close while interacting with content.
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  }

  return (
    <div
      data-testid="cast-modal-backdrop"
      style={castConfirmModalStyles.backdrop}
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        style={castConfirmModalStyles.dialog}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CastConfirmModal({
  orderedScenes,
  extraction,
  hasExistingBlocks,
  onConfirmCast,
  onCancel,
}: CastConfirmModalProps) {
  // Initialise editable entries from the proposal (completed state).
  // Note: extraction may arrive asynchronously (GET resolves after first render),
  // so we also sync via useEffect when it transitions to completed.
  const initialEntries: CastProposalEntry[] =
    extraction?.status === 'completed' && extraction.proposal
      ? extraction.proposal.map((e) => ({ ...e }))
      : [];

  const [entries, setEntries] = useState<CastProposalEntry[]>(initialEntries);
  const [submitting, setSubmitting] = useState(false);

  // Sync entries when extraction arrives asynchronously (AC-01).
  useEffect(() => {
    if (extraction?.status === 'completed' && extraction.proposal && entries.length === 0) {
      setEntries(extraction.proposal.map((e) => ({ ...e })));
    }
  }, [extraction, entries.length]);

  // AC-01b: draft already has confirmed reference blocks — show existing-blocks state.
  if (hasExistingBlocks) {
    return (
      <CastModalShell onCancel={onCancel}>
        <div data-testid="cast-already-confirmed">
          <p>Cast already confirmed. You can add more entries manually from the canvas.</p>
          <button data-testid="cast-cancel-button" onClick={onCancel}>Close</button>
        </div>
      </CastModalShell>
    );
  }

  // AC-01 running/queued state — show progress indicator, no confirm.
  if (extraction && (extraction.status === 'running' || extraction.status === 'queued')) {
    return (
      <CastModalShell onCancel={onCancel}>
        <div data-testid="cast-extraction-progress">
          <p>Extracting cast from your storyboard&hellip;</p>
          <button data-testid="cast-cancel-button" onClick={onCancel}>Cancel</button>
        </div>
      </CastModalShell>
    );
  }

  // Failed state.
  if (extraction && extraction.status === 'failed') {
    return (
      <CastModalShell onCancel={onCancel}>
        <div data-testid="cast-extraction-failed">
          <p>Cast extraction failed: {extraction.errorMessage}</p>
          <button data-testid="cast-cancel-button" onClick={onCancel}>Close</button>
        </div>
      </CastModalShell>
    );
  }

  // No extraction started yet — show start action.
  if (!extraction) {
    return (
      <CastModalShell onCancel={onCancel}>
        <div data-testid="cast-no-extraction">
          <button data-testid="start-cast-extraction">Start reference generation</button>
          <button data-testid="cast-cancel-button" onClick={onCancel}>Cancel</button>
        </div>
      </CastModalShell>
    );
  }

  // Completed — show proposal for review.
  const aggregateCredits = extraction.aggregateEstimateCredits ?? 0;

  function handleEntryChange(index: number, updated: CastProposalEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? updated : e)));
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirmCast(entries, aggregateCredits);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CastModalShell onCancel={onCancel}>
      <div data-testid="cast-proposal-review">
        <h2>Review Cast Proposal</h2>

        {extraction.truncated && (
          <div data-testid="cast-overflow-message">
            Some cast entries were omitted due to the cast size limit. You can add more entries manually after confirming.
          </div>
        )}

        {entries.map((entry, i) => (
          <EntryEditor key={i} entry={entry} index={i} orderedScenes={orderedScenes} onChange={handleEntryChange} />
        ))}

        <div data-testid="cast-aggregate-estimate">
          Estimated cost: {aggregateCredits} credits
        </div>

        <button
          data-testid="cast-confirm-button"
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? 'Confirming…' : 'Confirm Cast'}
        </button>
        <button data-testid="cast-cancel-button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </CastModalShell>
  );
}
