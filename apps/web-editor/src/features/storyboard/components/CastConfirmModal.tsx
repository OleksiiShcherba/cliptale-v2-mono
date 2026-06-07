/**
 * CastConfirmModal — T17, AC-01, AC-01b, AC-02, AC-03.
 *
 * Presents the cast extraction proposal for review and in-place correction
 * before the Creator confirms and triggers reference generation.
 */

import React, { useState } from 'react';

import type { StoryboardBlock } from '@/features/storyboard/types';

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
  onChange: (index: number, updated: CastProposalEntry) => void;
};

function EntryEditor({ entry, index, onChange }: EntryEditorProps) {
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(index, { ...entry, name: e.target.value });
  }

  function handleDescChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(index, { ...entry, description: e.target.value });
  }

  return (
    <div data-testid={`cast-entry-${index}`} style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px solid #ccc' }}>
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
      <div data-testid={`cast-entry-scene-links-${index}`}>
        {entry.sceneBlockIds.map((id) => (
          <span key={id}>{id}</span>
        ))}
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
// Main component
// ---------------------------------------------------------------------------

export function CastConfirmModal({
  extraction,
  hasExistingBlocks,
  onConfirmCast,
  onCancel,
}: CastConfirmModalProps) {
  // Initialise editable entries from the proposal (completed state).
  const initialEntries: CastProposalEntry[] =
    extraction?.status === 'completed' && extraction.proposal
      ? extraction.proposal.map((e) => ({ ...e }))
      : [];

  const [entries, setEntries] = useState<CastProposalEntry[]>(initialEntries);
  const [submitting, setSubmitting] = useState(false);

  // AC-01b: draft already has confirmed reference blocks — show existing-blocks state.
  if (hasExistingBlocks) {
    return (
      <div data-testid="cast-already-confirmed">
        <p>Cast already confirmed. You can add more entries manually from the canvas.</p>
        <button data-testid="cast-cancel-button" onClick={onCancel}>Close</button>
      </div>
    );
  }

  // AC-01 running/queued state — show progress indicator, no confirm.
  if (extraction && (extraction.status === 'running' || extraction.status === 'queued')) {
    return (
      <div data-testid="cast-extraction-progress">
        <p>Extracting cast from your storyboard&hellip;</p>
        <button data-testid="cast-cancel-button" onClick={onCancel}>Cancel</button>
      </div>
    );
  }

  // Failed state.
  if (extraction && extraction.status === 'failed') {
    return (
      <div>
        <p>Cast extraction failed: {extraction.errorMessage}</p>
        <button data-testid="cast-cancel-button" onClick={onCancel}>Close</button>
      </div>
    );
  }

  // No extraction started yet — show start action.
  if (!extraction) {
    return (
      <div>
        <button data-testid="start-cast-extraction">Start reference generation</button>
        <button data-testid="cast-cancel-button" onClick={onCancel}>Cancel</button>
      </div>
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
    <div>
      <h2>Review Cast Proposal</h2>

      {extraction.truncated && (
        <div data-testid="cast-overflow-message">
          Some cast entries were omitted due to the cast size limit. You can add more entries manually after confirming.
        </div>
      )}

      {entries.map((entry, i) => (
        <EntryEditor key={i} entry={entry} index={i} onChange={handleEntryChange} />
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
  );
}
