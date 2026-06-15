/**
 * BlockingLoader — component tests (T16, UI-surface AC coverage).
 *
 * Tests the full-screen blocking loader that renders while a pipeline phase
 * is active (`state.active_run_phase !== null`).
 *
 * DoD: renders payload.loader_label, exposes a cancel control wired to
 * onCancel(active_run_phase), and releases (renders nothing) when
 * state is null or active_run_phase is null.
 *
 * Level: component (per test-plan.md "UI-surface coverage" row 1).
 *
 * ── Testids expected by the implementer ────────────────────────────────────
 *   data-testid="blocking-loader"          root element (full-screen overlay)
 *   data-testid="blocking-loader-label"    the text label shown to the user
 *   data-testid="blocking-loader-cancel"   the cancel button / control
 * ────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { PipelineState, PhaseName } from '@/features/storyboard/api';

// ── Import target (does not exist yet — will fail on assertion, not import) ──
import { BlockingLoader } from './BlockingLoader';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PHASES: PipelineState['phases'] = {
  scene: { status: 'idle' },
  reference_data: { status: 'idle' },
  reference_image: { status: 'idle' },
  scene_image: { status: 'idle' },
};

function makeState(
  active_run_phase: PhaseName | null,
  payload: unknown = null,
): PipelineState {
  return {
    draft_id: 'draft-001',
    active_phase: active_run_phase ?? 'scene',
    active_run_phase,
    phases: BASE_PHASES,
    payload,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: '2026-06-15T00:00:00Z',
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderLoader(
  state: PipelineState | null,
  onCancel: ReturnType<typeof vi.fn> = vi.fn(),
) {
  return render(<BlockingLoader state={state} onCancel={onCancel} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. Label render ───────────────────────────────────────────────────────────

describe('BlockingLoader — label render', () => {
  it('renders the loader and shows payload.loader_label when provided (scene phase)', () => {
    const state = makeState('scene', { loader_label: 'Generating scenes…' });

    renderLoader(state);

    // The loader root must be in the document.
    expect(screen.getByTestId('blocking-loader')).toBeTruthy();

    // The exact loader_label from payload must appear in the label element.
    const label = screen.getByTestId('blocking-loader-label');
    expect(label.textContent).toContain('Generating scenes…');
  });

  it('renders a non-empty fallback label when payload is null and active_run_phase is reference_image', () => {
    const state = makeState('reference_image', null);

    renderLoader(state);

    expect(screen.getByTestId('blocking-loader')).toBeTruthy();

    // A fallback label must be rendered — we assert it is non-empty and loosely
    // references the phase (case-insensitive: "reference" or "image" or "generating").
    const label = screen.getByTestId('blocking-loader-label');
    expect(label.textContent?.trim().length).toBeGreaterThan(0);
    expect(label.textContent?.toLowerCase()).toMatch(
      /reference|image|generating/i,
    );
  });

  it('renders a non-empty fallback label for the scene phase when payload is null', () => {
    const state = makeState('scene', null);

    renderLoader(state);

    const label = screen.getByTestId('blocking-loader-label');
    expect(label.textContent?.trim().length).toBeGreaterThan(0);
    expect(label.textContent?.toLowerCase()).toMatch(/scene|generating/i);
  });

  it('renders a non-empty fallback label for reference_data when payload has no loader_label', () => {
    const state = makeState('reference_data', { unrelated: true });

    renderLoader(state);

    const label = screen.getByTestId('blocking-loader-label');
    expect(label.textContent?.trim().length).toBeGreaterThan(0);
    // Loose match: "cast", "reference", "analyzing" or "generating" all acceptable.
    expect(label.textContent?.toLowerCase()).toMatch(
      /cast|reference|analyzing|generating/i,
    );
  });
});

// ── 2. Cancel ─────────────────────────────────────────────────────────────────

describe('BlockingLoader — cancel control', () => {
  it('calls onCancel with the active_run_phase when the cancel control is clicked (scene)', () => {
    const onCancel = vi.fn();
    const state = makeState('scene', { loader_label: 'Generating scenes…' });

    renderLoader(state, onCancel);

    const cancelBtn = screen.getByTestId('blocking-loader-cancel');
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('scene');
  });

  it('calls onCancel with reference_image when that phase is active', () => {
    const onCancel = vi.fn();
    const state = makeState('reference_image', null);

    renderLoader(state, onCancel);

    fireEvent.click(screen.getByTestId('blocking-loader-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('reference_image');
  });

  it('exposes the cancel control when the loader is shown', () => {
    const state = makeState('scene_image', null);

    renderLoader(state);

    expect(screen.getByTestId('blocking-loader-cancel')).toBeTruthy();
  });
});

// ── 3. Release ────────────────────────────────────────────────────────────────

describe('BlockingLoader — release (renders nothing)', () => {
  it('renders nothing when active_run_phase is null (phase idle/completed)', () => {
    const state = makeState(null);

    renderLoader(state);

    expect(screen.queryByTestId('blocking-loader')).toBeNull();
    expect(screen.queryByTestId('blocking-loader-cancel')).toBeNull();
  });

  it('renders nothing when state is null', () => {
    renderLoader(null);

    expect(screen.queryByTestId('blocking-loader')).toBeNull();
    expect(screen.queryByTestId('blocking-loader-cancel')).toBeNull();
  });

  it('renders nothing when active_run_phase is null even if other phase data exists', () => {
    const state: PipelineState = {
      draft_id: 'draft-002',
      active_phase: 'scene',
      active_run_phase: null,
      phases: {
        scene: { status: 'failed' },
        reference_data: { status: 'idle' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
      payload: { loader_label: 'This should not appear' },
      version: 5,
      cost_estimate: null,
      error_message: 'Phase failed',
      updated_at: '2026-06-15T01:00:00Z',
    };

    renderLoader(state);

    expect(screen.queryByTestId('blocking-loader')).toBeNull();
    expect(screen.queryByTestId('blocking-loader-label')).toBeNull();
  });
});
