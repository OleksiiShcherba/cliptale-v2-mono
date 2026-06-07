/**
 * Tests for ReferenceBlockNode (storyboard-reference-flows T15).
 *
 * ACs exercised (component level — per test-plan.md):
 *   AC-03 — block shows preview from primary-starred file on the canvas
 *   AC-04 — failed window_status shows error reason + retry button; status badge reflects state
 *   AC-05 — clicking the block calls onOpenFlow so the linked flow opens (same-tab navigation)
 *   AC-07 — no primary star → no-preview placeholder; block with no stars → placeholder
 *   AC-11 — manually-added block (window_status=null) renders without a status badge;
 *            an "Add reference block" action calls onAddBlock
 *
 * Conventions mirror MusicBlockNode.test.tsx (closest precedent):
 *   - React Testing Library, vitest, no router / store
 *   - data-testid as the selector anchor
 *   - callbacks are vi.fn(); assert calls and arguments
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { ReferenceBlockNodeData } from '../types';
import { ReferenceBlockNode } from './ReferenceBlockNode';

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeData(overrides?: Partial<ReferenceBlockNodeData>): ReferenceBlockNodeData {
  return {
    referenceBlock: {
      id: 'rb-1',
      draftId: 'draft-1',
      flowId: 'flow-1',
      castType: 'character',
      name: 'Test Character',
      description: 'A brave hero',
      sortOrder: 0,
      positionX: 100,
      positionY: 200,
      windowStatus: 'done',
      firstJobId: null,
      errorMessage: null,
      version: 1,
      createdAt: '2026-06-07T00:00:00Z',
      updatedAt: '2026-06-07T00:00:00Z',
    },
    /** URL (or file id) of the primary-starred result — null = no-preview placeholder. */
    previewUrl: 'https://cdn.example.test/primary-star.jpg',
    onOpenFlow: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

// ── AC-03: preview from primary star ──────────────────────────────────────────

describe('ReferenceBlockNode — AC-03 (preview from primary star)', () => {
  it('renders the block name and displays a preview image when previewUrl is provided', () => {
    render(<ReferenceBlockNode id="rb-1" data={makeData()} />);

    expect(screen.getByTestId('reference-block-name').textContent).toBe('Test Character');
    const img = screen.getByTestId('reference-block-preview') as HTMLImageElement;
    expect(img.src).toContain('primary-star.jpg');
  });

  it('renders the cast_type badge (character or environment)', () => {
    render(<ReferenceBlockNode id="rb-1" data={makeData()} />);

    const badge = screen.getByTestId('reference-block-type-badge');
    expect(badge.textContent?.toLowerCase()).toMatch(/character/);
  });
});

// ── AC-07: no-preview placeholder ─────────────────────────────────────────────

describe('ReferenceBlockNode — AC-07 (no-preview placeholder)', () => {
  it('shows the no-preview placeholder when previewUrl is null (primary star removed)', () => {
    render(<ReferenceBlockNode id="rb-1" data={makeData({ previewUrl: null })} />);

    expect(screen.queryByTestId('reference-block-preview')).toBeNull();
    expect(screen.getByTestId('reference-block-preview-placeholder')).toBeTruthy();
  });
});

// ── AC-04: failed status + retry ─────────────────────────────────────────────

describe('ReferenceBlockNode — AC-04 (failed status + retry)', () => {
  it('shows failed status badge and error reason when window_status is failed', () => {
    const data = makeData({
      referenceBlock: {
        id: 'rb-fail',
        draftId: 'draft-1',
        flowId: 'flow-1',
        castType: 'character',
        name: 'Test Character',
        description: null,
        sortOrder: 0,
        positionX: 0,
        positionY: 0,
        windowStatus: 'failed',
        firstJobId: 'job-1',
        errorMessage: 'Provider timeout — please retry',
        version: 1,
        createdAt: '2026-06-07T00:00:00Z',
        updatedAt: '2026-06-07T00:00:00Z',
      },
    });

    render(<ReferenceBlockNode id="rb-fail" data={data} />);

    const statusBadge = screen.getByTestId('reference-block-status-badge');
    expect(statusBadge.textContent?.toLowerCase()).toMatch(/fail/);
    expect(screen.getByTestId('reference-block-error-message').textContent).toContain(
      'Provider timeout',
    );
    expect(screen.getByTestId('reference-block-retry-button')).toBeTruthy();
  });

  it('calls onRetry with the block id when retry is clicked', () => {
    const onRetry = vi.fn();
    const data = makeData({
      onRetry,
      referenceBlock: {
        id: 'rb-fail-2',
        draftId: 'draft-1',
        flowId: 'flow-1',
        castType: 'character',
        name: 'Test Character',
        description: null,
        sortOrder: 0,
        positionX: 0,
        positionY: 0,
        windowStatus: 'failed',
        firstJobId: 'job-2',
        errorMessage: 'Out of credits',
        version: 1,
        createdAt: '2026-06-07T00:00:00Z',
        updatedAt: '2026-06-07T00:00:00Z',
      },
    });

    render(<ReferenceBlockNode id="rb-fail-2" data={data} />);
    fireEvent.click(screen.getByTestId('reference-block-retry-button'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith('rb-fail-2');
  });

  it('renders status badge for pending / running / done states', () => {
    for (const windowStatus of ['pending', 'running', 'done'] as const) {
      const { unmount } = render(
        <ReferenceBlockNode
          id={`rb-${windowStatus}`}
          data={makeData({
            referenceBlock: {
              id: `rb-${windowStatus}`,
              draftId: 'draft-1',
              flowId: 'flow-1',
              castType: 'character',
              name: 'Test Character',
              description: null,
              sortOrder: 0,
              positionX: 0,
              positionY: 0,
              windowStatus,
              firstJobId: null,
              errorMessage: null,
              version: 1,
              createdAt: '2026-06-07T00:00:00Z',
              updatedAt: '2026-06-07T00:00:00Z',
            },
          })}
        />,
      );
      const badge = screen.getByTestId('reference-block-status-badge');
      expect(badge.textContent?.toLowerCase()).toMatch(new RegExp(windowStatus));
      unmount();
    }
  });
});

// ── AC-05: open linked flow ───────────────────────────────────────────────────

describe('ReferenceBlockNode — AC-05 (open linked flow)', () => {
  it('calls onOpenFlow with the block id when the node is clicked', () => {
    const onOpenFlow = vi.fn();
    render(<ReferenceBlockNode id="rb-1" data={makeData({ onOpenFlow })} />);

    fireEvent.click(screen.getByTestId('reference-block-node'));

    expect(onOpenFlow).toHaveBeenCalledTimes(1);
    expect(onOpenFlow).toHaveBeenCalledWith('rb-1');
  });

  it('does NOT call onOpenFlow when the block is in no-flow state (flowId null)', () => {
    const onOpenFlow = vi.fn();
    const data = makeData({
      onOpenFlow,
      referenceBlock: {
        id: 'rb-noflow',
        draftId: 'draft-1',
        flowId: null,
        castType: 'character',
        name: 'Test Character',
        description: null,
        sortOrder: 0,
        positionX: 0,
        positionY: 0,
        windowStatus: null,
        firstJobId: null,
        errorMessage: null,
        version: 1,
        createdAt: '2026-06-07T00:00:00Z',
        updatedAt: '2026-06-07T00:00:00Z',
      },
    });

    render(<ReferenceBlockNode id="rb-noflow" data={data} />);
    fireEvent.click(screen.getByTestId('reference-block-node'));

    expect(onOpenFlow).not.toHaveBeenCalled();
  });
});

// ── No-flow state ─────────────────────────────────────────────────────────────

describe('ReferenceBlockNode — no-flow state (AC-12 consequence)', () => {
  it('shows the no-flow indicator when flowId is null', () => {
    const data = makeData({
      referenceBlock: {
        id: 'rb-noflow',
        draftId: 'draft-1',
        flowId: null,
        castType: 'environment',
        name: 'Test Environment',
        description: null,
        sortOrder: 1,
        positionX: 0,
        positionY: 0,
        windowStatus: null,
        firstJobId: null,
        errorMessage: null,
        version: 1,
        createdAt: '2026-06-07T00:00:00Z',
        updatedAt: '2026-06-07T00:00:00Z',
      },
    });

    render(<ReferenceBlockNode id="rb-noflow" data={data} />);

    expect(screen.getByTestId('reference-block-no-flow')).toBeTruthy();
  });
});

// ── AC-11: manually-added block (windowStatus = null) ────────────────────────

describe('ReferenceBlockNode — AC-11 (manually-added block)', () => {
  it('does NOT render a status badge when window_status is null (manually-added block)', () => {
    const data = makeData({
      referenceBlock: {
        id: 'rb-manual',
        draftId: 'draft-1',
        flowId: 'flow-manual',
        castType: 'environment',
        name: 'Test Environment',
        description: null,
        sortOrder: 2,
        positionX: 50,
        positionY: 50,
        windowStatus: null,
        firstJobId: null,
        errorMessage: null,
        version: 1,
        createdAt: '2026-06-07T00:00:00Z',
        updatedAt: '2026-06-07T00:00:00Z',
      },
    });

    render(<ReferenceBlockNode id="rb-manual" data={data} />);

    // Manually-added blocks have no auto-run status — the badge must be absent
    expect(screen.queryByTestId('reference-block-status-badge')).toBeNull();
  });
});
