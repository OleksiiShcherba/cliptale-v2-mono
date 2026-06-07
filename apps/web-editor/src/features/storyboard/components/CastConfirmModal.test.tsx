/**
 * CastConfirmModal — component tests (T17, AC-01, AC-01b, AC-02, AC-03).
 *
 * AC-01 (happy path — extraction progress + proposal review):
 *   Given cast extraction is in progress,
 *   When the CastConfirmModal is rendered with a running extraction,
 *   Then it shows an extraction progress indicator and no confirm button yet;
 *   once the extraction completes (completed status), it shows the proposal
 *   (characters and environments each with description, assigned images,
 *   proposed scene links — all correctable in place), shows an aggregate cost
 *   estimate, and does NOT fire confirmCast on its own.
 *
 * AC-01b (edge — existing blocks hide extraction action):
 *   Given a draft that already has reference blocks (a confirmed cast),
 *   When the CastConfirmModal is rendered,
 *   Then the cast-extraction action ("Start reference generation" / similar)
 *   is NOT shown — only the existing-blocks state is visible.
 *
 * AC-02 (domain invariant — cast size limit / overflow message):
 *   Given the extraction proposal was truncated to the cast size limit,
 *   When the CastConfirmModal renders the completed proposal,
 *   Then it shows a message telling the Creator that more entries can be
 *   added manually later; it does NOT silently drop the overflow.
 *
 * AC-03 (happy path — confirm sends corrected cast):
 *   Given the Creator has reviewed and optionally corrected the proposed cast,
 *   When they press Confirm,
 *   Then onConfirmCast is called with the corrected entries (name, description,
 *   castType, imageFileIds, sceneBlockIds) AND the acknowledged aggregate
 *   credit estimate — nothing is charged by the modal itself (the call is the
 *   extent of modal responsibility).
 *
 * Level: component (per test-plan.md AC-01/AC-01b/AC-02/AC-03 rows).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { StoryboardBlock } from '@/features/storyboard/types';

// ---------------------------------------------------------------------------
// Type definitions expected from the not-yet-written production component.
// These mirror the openapi.yaml CastProposalEntry and CastExtractionJob shapes
// (contracts/openapi.yaml §CastProposalEntry, §CastExtractionJob).
// ---------------------------------------------------------------------------

export type CastProposalEntry = {
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  /** Creator-uploaded reference images assigned to the entry. */
  imageFileIds: string[];
  /** AI-proposed scene links — individual scene block ids. */
  sceneBlockIds: string[];
  /** Credits estimate for the entry's first run. */
  perRunEstimate: number;
};

export type CastExtractionStatus = 'queued' | 'running' | 'completed' | 'failed';

export type CastExtractionJob = {
  jobId: string;
  draftId: string;
  status: CastExtractionStatus;
  /** Populated on 'completed'; at most 12 entries (cast size limit). */
  proposal: CastProposalEntry[] | null;
  /** Sum of per-run estimates shown in the confirmation modal. */
  aggregateEstimateCredits: number | null;
  errorMessage: string | null;
  /** Whether the proposal was truncated (more candidates existed than the limit). */
  truncated?: boolean;
};

export type CastConfirmModalProps = {
  /** Ordered scene blocks of the draft (for SceneLinkSelector). */
  orderedScenes: StoryboardBlock[];
  /** The current extraction job (null = none started yet). */
  extraction: CastExtractionJob | null;
  /**
   * Whether the draft already has confirmed reference blocks.
   * When true, the extraction action is hidden (AC-01b).
   */
  hasExistingBlocks: boolean;
  /**
   * Called when the Creator confirms the (possibly corrected) cast.
   * Receives the final entry list and the acknowledged aggregate credits.
   * AC-03: the modal calls this, charges nothing itself.
   */
  onConfirmCast: (
    entries: CastProposalEntry[],
    acknowledgedAggregateCredits: number,
  ) => Promise<void>;
  /** Called when the Creator cancels/closes the modal. */
  onCancel: () => void;
};

// ---------------------------------------------------------------------------
// The production component — not written yet; import will fail → RED.
// ---------------------------------------------------------------------------

import { CastConfirmModal } from './CastConfirmModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCENE_A: StoryboardBlock = {
  id: 'scene-a',
  draftId: 'draft-1',
  blockType: 'scene',
  name: 'Opening',
  prompt: null,
  videoPrompt: null,
  durationS: 5,
  positionX: 0,
  positionY: 0,
  sortOrder: 1,
  style: null,
  mediaItems: [],
  createdAt: '2026-06-07T00:00:00Z',
  updatedAt: '2026-06-07T00:00:00Z',
};

const SCENE_B: StoryboardBlock = {
  id: 'scene-b',
  draftId: 'draft-1',
  blockType: 'scene',
  name: 'Climax',
  prompt: null,
  videoPrompt: null,
  durationS: 5,
  positionX: 0,
  positionY: 0,
  sortOrder: 2,
  style: null,
  mediaItems: [],
  createdAt: '2026-06-07T00:00:00Z',
  updatedAt: '2026-06-07T00:00:00Z',
};

const ORDERED_SCENES = [SCENE_A, SCENE_B];

const CHARACTER_ENTRY: CastProposalEntry = {
  castType: 'character',
  name: 'Test Character',
  description: 'A test protagonist.',
  imageFileIds: ['file-001'],
  sceneBlockIds: ['scene-a', 'scene-b'],
  perRunEstimate: 0.42,
};

const ENV_ENTRY: CastProposalEntry = {
  castType: 'environment',
  name: 'Test Environment',
  description: 'A test location.',
  imageFileIds: [],
  sceneBlockIds: ['scene-a'],
  perRunEstimate: 0.42,
};

const COMPLETED_EXTRACTION: CastExtractionJob = {
  jobId: 'job-001',
  draftId: 'draft-1',
  status: 'completed',
  proposal: [CHARACTER_ENTRY, ENV_ENTRY],
  aggregateEstimateCredits: 0.84,
  errorMessage: null,
  truncated: false,
};

const RUNNING_EXTRACTION: CastExtractionJob = {
  jobId: 'job-002',
  draftId: 'draft-1',
  status: 'running',
  proposal: null,
  aggregateEstimateCredits: null,
  errorMessage: null,
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderModal(overrides: Partial<CastConfirmModalProps> = {}) {
  const props: CastConfirmModalProps = {
    orderedScenes: ORDERED_SCENES,
    extraction: COMPLETED_EXTRACTION,
    hasExistingBlocks: false,
    onConfirmCast: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<CastConfirmModal {...props} />) };
}

// ---------------------------------------------------------------------------
// AC-01: extraction progress — running state shows progress, no confirm yet
// ---------------------------------------------------------------------------

describe('CastConfirmModal — AC-01 (extraction progress)', () => {
  it('shows an extraction progress indicator while extraction is running', () => {
    renderModal({ extraction: RUNNING_EXTRACTION });

    // A progress indicator must be visible while extraction is in flight.
    expect(screen.getByTestId('cast-extraction-progress')).toBeTruthy();
  });

  it('does NOT show the confirm button while extraction is still running, but DOES show a progress indicator (AC-01 — no paid gen yet)', () => {
    renderModal({ extraction: RUNNING_EXTRACTION });

    // The confirm button must not be present until the proposal arrives.
    expect(screen.queryByTestId('cast-confirm-button')).toBeNull();
    // The progress indicator MUST be rendered (modal must show something meaningful).
    expect(screen.getByTestId('cast-extraction-progress')).toBeTruthy();
  });

  it('does NOT fire onConfirmCast automatically when extraction completes, but DOES render the proposal UI (AC-01)', () => {
    const onConfirmCast = vi.fn();
    renderModal({ extraction: COMPLETED_EXTRACTION, onConfirmCast });

    // The modal must render the proposal for review (precondition: something is displayed).
    expect(screen.getByTestId('cast-entry-0')).toBeTruthy();
    // Just rendering a completed extraction must not fire the confirm callback —
    // the Creator must explicitly press Confirm (no paid generation yet).
    expect(onConfirmCast).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-01: completed proposal — characters, environments, descriptions, images,
//         scene links shown; all correctable in place; aggregate estimate shown
// ---------------------------------------------------------------------------

describe('CastConfirmModal — AC-01 (completed proposal review)', () => {
  it('renders each proposal entry with its name visible', () => {
    renderModal();

    expect(screen.getByTestId('cast-entry-0')).toBeTruthy();
    expect(screen.getByTestId('cast-entry-1')).toBeTruthy();
    expect(screen.getByText('Test Character')).toBeTruthy();
    expect(screen.getByText('Test Environment')).toBeTruthy();
  });

  it('renders each entry description in an editable field', () => {
    renderModal();

    // Descriptions must be correctable in place — an input or textarea per entry.
    const descInputs = screen.getAllByTestId(/^cast-entry-description-/);
    expect(descInputs.length).toBeGreaterThanOrEqual(2);
    // The character description must be pre-filled.
    const charDesc = screen.getByTestId('cast-entry-description-0') as HTMLTextAreaElement | HTMLInputElement;
    expect(charDesc.value).toBe('A test protagonist.');
  });

  it('renders each entry name in an editable field', () => {
    renderModal();

    const nameInput = screen.getByTestId('cast-entry-name-0') as HTMLInputElement;
    expect(nameInput.value).toBe('Test Character');
  });

  it('shows assigned image thumbnails for entries that have imageFileIds', () => {
    renderModal();

    // Entry 0 (character) has file-001 assigned.
    expect(screen.getByTestId('cast-entry-image-file-001')).toBeTruthy();
  });

  it('renders a SceneLinkSelector (or scene-link area) for each entry', () => {
    renderModal();

    // Each entry must expose scene-link editing (via SceneLinkSelector or equivalent).
    // We assert the containers exist for both entries.
    expect(screen.getByTestId('cast-entry-scene-links-0')).toBeTruthy();
    expect(screen.getByTestId('cast-entry-scene-links-1')).toBeTruthy();
  });

  it('shows the aggregate cost estimate (AC-01 — Creator sees cost before confirming)', () => {
    renderModal();

    // The aggregate estimate must be visible in the modal (0.84 credits).
    expect(screen.getByTestId('cast-aggregate-estimate')).toBeTruthy();
    const estimate = screen.getByTestId('cast-aggregate-estimate');
    expect(estimate.textContent).toMatch(/0\.84/);
  });

  it('shows the confirm button when a completed proposal is present', () => {
    renderModal();

    expect(screen.getByTestId('cast-confirm-button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC-01b: draft with existing blocks — extraction action is hidden
// ---------------------------------------------------------------------------

describe('CastConfirmModal — AC-01b (existing blocks hide extraction action)', () => {
  it('does NOT show the start-extraction action when the draft already has reference blocks, but DOES show the already-confirmed state', () => {
    renderModal({ hasExistingBlocks: true, extraction: null });

    // The "Start reference generation" / cast extraction trigger must not appear.
    expect(screen.queryByTestId('start-cast-extraction')).toBeNull();
    // The already-confirmed indicator must appear (modal must render something).
    expect(screen.getByTestId('cast-already-confirmed')).toBeTruthy();
  });

  it('does NOT show the cast-extraction proposal form when hasExistingBlocks=true, but DOES show already-confirmed state', () => {
    renderModal({ hasExistingBlocks: true, extraction: null });

    // No proposal form — the draft's cast already confirmed.
    expect(screen.queryByTestId('cast-entry-0')).toBeNull();
    expect(screen.queryByTestId('cast-confirm-button')).toBeNull();
    // Something meaningful must be rendered (not just null).
    expect(screen.getByTestId('cast-already-confirmed')).toBeTruthy();
  });

  it('shows the existing-blocks state indicator when hasExistingBlocks=true', () => {
    renderModal({ hasExistingBlocks: true, extraction: null });

    // Some indicator that the cast is already confirmed must be present
    // (so the Creator knows why the extraction action is absent).
    expect(screen.getByTestId('cast-already-confirmed')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AC-02: cast size limit — overflow message visible when truncated
// ---------------------------------------------------------------------------

describe('CastConfirmModal — AC-02 (overflow / truncation message)', () => {
  it('shows an overflow message when the proposal was truncated (truncated=true)', () => {
    const truncatedExtraction: CastExtractionJob = {
      ...COMPLETED_EXTRACTION,
      truncated: true,
    };
    renderModal({ extraction: truncatedExtraction });

    // The Creator must be told that more entries can be added manually.
    expect(screen.getByTestId('cast-overflow-message')).toBeTruthy();
  });

  it('does NOT show the overflow message when the proposal was not truncated, but DOES show the confirm button (truncated=false)', () => {
    renderModal({ extraction: { ...COMPLETED_EXTRACTION, truncated: false } });

    expect(screen.queryByTestId('cast-overflow-message')).toBeNull();
    // The confirm button must still be present (proposal not truncated = normal flow).
    expect(screen.getByTestId('cast-confirm-button')).toBeTruthy();
  });

  it('overflow message mentions adding entries manually', () => {
    const truncatedExtraction: CastExtractionJob = {
      ...COMPLETED_EXTRACTION,
      truncated: true,
    };
    renderModal({ extraction: truncatedExtraction });

    const msg = screen.getByTestId('cast-overflow-message');
    expect(msg.textContent?.toLowerCase()).toMatch(/manually|add/);
  });
});

// ---------------------------------------------------------------------------
// AC-03: confirm sends the corrected cast and the acknowledged aggregate credits
// ---------------------------------------------------------------------------

describe('CastConfirmModal — AC-03 (confirm sends corrected cast)', () => {
  it('calls onConfirmCast with the original entries when no in-place edits were made', async () => {
    const onConfirmCast = vi.fn().mockResolvedValue(undefined);
    renderModal({ onConfirmCast });

    fireEvent.click(screen.getByTestId('cast-confirm-button'));

    await waitFor(() => {
      expect(onConfirmCast).toHaveBeenCalledTimes(1);
    });

    const [entries, acknowledgedCredits] = onConfirmCast.mock.calls[0] as [CastProposalEntry[], number];
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('Test Character');
    expect(entries[0].castType).toBe('character');
    expect(entries[1].name).toBe('Test Environment');
    expect(entries[1].castType).toBe('environment');
    // The aggregate credits must be passed through (spec §1 ¶4 — collective confirmation).
    expect(acknowledgedCredits).toBeCloseTo(0.84);
  });

  it('calls onConfirmCast with the EDITED name when the Creator corrects it in place', async () => {
    const onConfirmCast = vi.fn().mockResolvedValue(undefined);
    renderModal({ onConfirmCast });

    // Creator edits the character name in place.
    const nameInput = screen.getByTestId('cast-entry-name-0') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Corrected Hero' } });

    fireEvent.click(screen.getByTestId('cast-confirm-button'));

    await waitFor(() => {
      expect(onConfirmCast).toHaveBeenCalledTimes(1);
    });

    const [entries] = onConfirmCast.mock.calls[0] as [CastProposalEntry[], number];
    expect(entries[0].name).toBe('Corrected Hero');
    // Other entries unchanged.
    expect(entries[1].name).toBe('Test Environment');
  });

  it('calls onConfirmCast with the EDITED description when the Creator corrects it in place', async () => {
    const onConfirmCast = vi.fn().mockResolvedValue(undefined);
    renderModal({ onConfirmCast });

    const descInput = screen.getByTestId('cast-entry-description-0') as HTMLTextAreaElement;
    fireEvent.change(descInput, { target: { value: 'Updated description' } });

    fireEvent.click(screen.getByTestId('cast-confirm-button'));

    await waitFor(() => {
      expect(onConfirmCast).toHaveBeenCalledTimes(1);
    });

    const [entries] = onConfirmCast.mock.calls[0] as [CastProposalEntry[], number];
    expect(entries[0].description).toBe('Updated description');
  });

  it('does NOT call onConfirmCast when the Creator presses Cancel', () => {
    const onConfirmCast = vi.fn();
    const onCancel = vi.fn();
    renderModal({ onConfirmCast, onCancel });

    fireEvent.click(screen.getByTestId('cast-cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirmCast).not.toHaveBeenCalled();
  });

  it('disables the confirm button while the confirmCast call is in flight (AC-03 — no double-submit)', async () => {
    let resolveConfirm!: () => void;
    const onConfirmCast = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveConfirm = resolve; }),
    );
    renderModal({ onConfirmCast });

    fireEvent.click(screen.getByTestId('cast-confirm-button'));

    // While in flight, the confirm button must be disabled (or show submitting state).
    await waitFor(() => {
      const btn = screen.getByTestId('cast-confirm-button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    // Clean up.
    resolveConfirm();
  });
});
