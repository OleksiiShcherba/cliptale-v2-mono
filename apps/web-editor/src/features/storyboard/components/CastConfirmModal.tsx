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
  onRemove: (index: number) => void;
};

function EntryEditor({ entry, index, orderedScenes, onChange, onRemove }: EntryEditorProps) {
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
      <div style={castConfirmModalStyles.entryHeader}>
        <button
          type="button"
          data-testid={`cast-entry-remove-${index}`}
          onClick={() => onRemove(index)}
          style={castConfirmModalStyles.removeEntryButton}
          aria-label={`Remove ${entry.name || 'reference'}`}
        >
          Remove
        </button>
      </div>
      <div style={castConfirmModalStyles.field}>
        <label style={castConfirmModalStyles.label}>Name</label>
        <input
          data-testid={`cast-entry-name-${index}`}
          value={entry.name}
          onChange={handleNameChange}
          aria-label={entry.name}
          style={castConfirmModalStyles.input}
        />
      </div>
      <div style={castConfirmModalStyles.field}>
        <label style={castConfirmModalStyles.label}>Description</label>
        <textarea
          data-testid={`cast-entry-description-${index}`}
          value={entry.description ?? ''}
          onChange={handleDescChange}
          style={castConfirmModalStyles.textarea}
        />
      </div>
      {/* AC-01 / AC-10: scene links correctable in place via the same multi-select selector.
          Pre-selected by the AI from the real scene ids (scene preselection). */}
      <div style={castConfirmModalStyles.field}>
        <label style={castConfirmModalStyles.label}>Used in scenes</label>
        <div data-testid={`cast-entry-scene-links-${index}`}>
          <SceneLinkSelector
            blockId={`proposal-entry-${index}`}
            orderedScenes={orderedScenes}
            linkedSceneIds={entry.sceneBlockIds}
            version={1}
            onSave={handleSceneLinkSave}
          />
        </div>
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
      role="presentation"
      onClick={handleBackdropClick}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Cast confirmation"
        tabIndex={-1}
        ref={dialogRef}
        style={castConfirmModalStyles.panel}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>
  );
}

/** Shared header — title (+ optional subtitle) and the close button. */
function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <header style={castConfirmModalStyles.header}>
      <div style={castConfirmModalStyles.titleGroup}>
        <h2 style={castConfirmModalStyles.title}>{title}</h2>
        {subtitle !== undefined && <span style={castConfirmModalStyles.subtitle}>{subtitle}</span>}
      </div>
      <button
        type="button"
        style={castConfirmModalStyles.closeButton}
        onClick={onClose}
        aria-label="Close cast confirmation"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  );
}

/** Human label for a cast section heading. */
const CAST_TYPE_LABEL: Record<CastProposalEntry['castType'], string> = {
  character: 'Character references',
  environment: 'Environment references',
};

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
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
        <ModalHeader title="Cast already confirmed" onClose={onCancel} />
        <div style={castConfirmModalStyles.body} data-testid="cast-already-confirmed">
          <p style={castConfirmModalStyles.message}>You can add more entries manually from the canvas.</p>
        </div>
        <div style={castConfirmModalStyles.footer}>
          <button data-testid="cast-cancel-button" onClick={onCancel} style={castConfirmModalStyles.primaryButton}>Close</button>
        </div>
      </CastModalShell>
    );
  }

  // AC-01 running/queued state — show progress indicator, no confirm.
  if (extraction && (extraction.status === 'running' || extraction.status === 'queued')) {
    return (
      <CastModalShell onCancel={onCancel}>
        <ModalHeader title="Preparing your cast" onClose={onCancel} />
        <div style={castConfirmModalStyles.body} data-testid="cast-extraction-progress">
          <p style={castConfirmModalStyles.message}>Your cast is being prepared&hellip; this usually takes a few seconds.</p>
        </div>
        <div style={castConfirmModalStyles.footer}>
          <button data-testid="cast-cancel-button" onClick={onCancel} style={castConfirmModalStyles.secondaryButton}>Cancel</button>
        </div>
      </CastModalShell>
    );
  }

  // Failed state.
  if (extraction && extraction.status === 'failed') {
    return (
      <CastModalShell onCancel={onCancel}>
        <ModalHeader title="Cast extraction failed" onClose={onCancel} />
        <div style={castConfirmModalStyles.body} data-testid="cast-extraction-failed">
          <p style={castConfirmModalStyles.error}>{extraction.errorMessage}</p>
        </div>
        <div style={castConfirmModalStyles.footer}>
          <button data-testid="cast-cancel-button" onClick={onCancel} style={castConfirmModalStyles.primaryButton}>Close</button>
        </div>
      </CastModalShell>
    );
  }

  // No extraction started yet — show start action.
  if (!extraction) {
    return (
      <CastModalShell onCancel={onCancel}>
        <ModalHeader title="Generate reference images" onClose={onCancel} />
        <div style={castConfirmModalStyles.body} data-testid="cast-no-extraction">
          <p style={castConfirmModalStyles.message}>Extract the cast from your storyboard to start preparing reference images.</p>
        </div>
        <div style={castConfirmModalStyles.footer}>
          <button data-testid="cast-cancel-button" onClick={onCancel} style={castConfirmModalStyles.secondaryButton}>Cancel</button>
          <button data-testid="start-cast-extraction" style={castConfirmModalStyles.primaryButton}>Start reference generation</button>
        </div>
      </CastModalShell>
    );
  }

  // AC-06: completed but proposed no cast — distinct close-only "nothing to
  // generate references for" state. No proposal form, no aggregate, no confirm.
  if (extraction.status === 'completed' && (!extraction.proposal || extraction.proposal.length === 0)) {
    return (
      <CastModalShell onCancel={onCancel}>
        <ModalHeader title="Nothing to generate" onClose={onCancel} />
        <div style={castConfirmModalStyles.body} data-testid="cast-extraction-empty">
          <p style={castConfirmModalStyles.message}>There is nothing to generate references for in this storyboard.</p>
        </div>
        <div style={castConfirmModalStyles.footer}>
          <button data-testid="cast-cancel-button" onClick={onCancel} style={castConfirmModalStyles.primaryButton}>Close</button>
        </div>
      </CastModalShell>
    );
  }

  // Completed with a non-empty proposal (proposal-ready) — show it for review.
  // Per-entry unit price derived from the server's trusted aggregate so the
  // estimate stays correct as the Creator adds / removes references.
  const baseCount = extraction.proposal?.length ?? 0;
  const unitPrice = baseCount > 0 ? (extraction.aggregateEstimateCredits ?? 0) / baseCount : 0;
  const liveEstimate = unitPrice * entries.length;

  function handleEntryChange(index: number, updated: CastProposalEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? updated : e)));
  }

  function handleAddEntry(castType: CastProposalEntry['castType']) {
    setEntries((prev) => [
      ...prev,
      { castType, name: '', description: '', imageFileIds: [], sceneBlockIds: [], perRunEstimate: unitPrice },
    ]);
  }

  function handleRemoveEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    setSubmitting(true);
    setConfirmError(null);
    try {
      // Drop blank custom rows the Creator added but never filled in, and
      // sanitize scene links to REAL scene ids — a stale/hallucinated id (e.g. a
      // numeric index from an extraction that ran before the plan created the
      // scenes) would fail the confirm endpoint's UUID validation with a 400.
      const validSceneIds = new Set(orderedScenes.map((s) => s.id));
      const toConfirm = entries
        .filter((e) => e.name.trim().length > 0)
        .map((e) => ({
          ...e,
          sceneBlockIds: e.sceneBlockIds.filter((id) => validSceneIds.has(id)),
        }));
      await onConfirmCast(toConfirm, liveEstimate);
    } catch (err) {
      // Surface the failure — a silently swallowed error reads as a dead button.
      setConfirmError(
        err instanceof Error ? err.message : 'Confirming the cast failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // #1: group entries by type into Character / Environment sections, keeping each
  // entry's ORIGINAL index so the testids + onChange stay stable. Each section can
  // be extended with a custom reference (add affordance).
  const indexedEntries = entries.map((entry, index) => ({ entry, index }));
  function renderSection(type: CastProposalEntry['castType']) {
    const group = indexedEntries.filter(({ entry }) => entry.castType === type);
    return (
      <div style={castConfirmModalStyles.section} data-testid={`cast-section-${type}`}>
        <div style={castConfirmModalStyles.sectionHeader}>
          <h3 style={castConfirmModalStyles.sectionTitle}>{CAST_TYPE_LABEL[type]}</h3>
          <span style={castConfirmModalStyles.sectionCount}>{group.length}</span>
        </div>
        {group.map(({ entry, index }) => (
          <EntryEditor
            key={index}
            entry={entry}
            index={index}
            orderedScenes={orderedScenes}
            onChange={handleEntryChange}
            onRemove={handleRemoveEntry}
          />
        ))}
        <button
          type="button"
          data-testid={`cast-add-${type}`}
          onClick={() => handleAddEntry(type)}
          style={castConfirmModalStyles.addEntryButton}
        >
          + Add {type === 'character' ? 'character' : 'environment'} reference
        </button>
      </div>
    );
  }

  return (
    <CastModalShell onCancel={onCancel}>
      <ModalHeader
        title="Review cast proposal"
        subtitle="Review and edit the extracted cast, then confirm to generate reference images."
        onClose={onCancel}
      />
      <div style={castConfirmModalStyles.body} data-testid="cast-proposal-review">
        {extraction.truncated && (
          <div data-testid="cast-overflow-message" style={castConfirmModalStyles.overflowMessage}>
            Some cast entries were omitted due to the cast size limit. You can add more entries manually after confirming.
          </div>
        )}

        {renderSection('character')}
        {renderSection('environment')}

        <div data-testid="cast-aggregate-estimate" style={castConfirmModalStyles.estimate}>
          <span>Estimated cost</span>
          <span style={castConfirmModalStyles.estimateAmount}>USD {liveEstimate.toFixed(2)}</span>
        </div>

        {confirmError && (
          <div data-testid="cast-confirm-error" style={castConfirmModalStyles.error}>
            {confirmError}
          </div>
        )}
      </div>
      <div style={castConfirmModalStyles.footer}>
        <button
          data-testid="cast-cancel-button"
          onClick={onCancel}
          disabled={submitting}
          style={castConfirmModalStyles.secondaryButton}
        >
          Cancel
        </button>
        <button
          data-testid="cast-confirm-button"
          onClick={handleConfirm}
          disabled={submitting}
          style={castConfirmModalStyles.primaryButton}
        >
          {submitting ? 'Confirming…' : 'Confirm Cast'}
        </button>
      </div>
    </CastModalShell>
  );
}
