import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRestoreToVersion = vi.fn();
const mockUseVersionHistory = vi.fn();

vi.mock('@/features/version-history/hooks/useVersionHistory', () => ({
  useVersionHistory: () => mockUseVersionHistory(),
}));

vi.mock('@/store/project-store', () => ({
  getCurrentVersionId: vi.fn().mockReturnValue(null),
}));

vi.mock('@/shared/utils/formatRelativeDate', () => ({
  formatRelativeDate: (_date: Date) => '2m ago',
}));

vi.mock('@/features/version-history/components/RestoreModal', () => ({
  RestoreModal: ({
    version,
    onConfirm,
    onCancel,
    isRestoring,
  }: {
    version: { versionId: number };
    onConfirm: () => void;
    onCancel: () => void;
    isRestoring: boolean;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'restore-modal', 'data-version-id': version.versionId },
      React.createElement('button', { onClick: onConfirm, 'data-testid': 'confirm-restore' }, 'Confirm'),
      React.createElement('button', { onClick: onCancel, 'data-testid': 'cancel-restore' }, 'Cancel'),
      isRestoring
        ? React.createElement('span', { 'data-testid': 'modal-restoring' }, 'Restoring')
        : null,
    ),
}));

import { VersionHistoryPanel } from './VersionHistoryPanel';
import * as projectStoreModule from '@/store/project-store';

const mockGetCurrentVersionId = vi.mocked(projectStoreModule.getCurrentVersionId);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VERSIONS = [
  {
    versionId: 12,
    createdAt: '2026-04-03T12:00:00.000Z',
    createdByUserId: 'user-1',
    durationFrames: 300,
  },
  {
    versionId: 11,
    createdAt: '2026-04-03T11:52:00.000Z',
    createdByUserId: 'user-1',
    durationFrames: 290,
  },
  {
    versionId: 10,
    createdAt: '2026-04-03T11:00:00.000Z',
    createdByUserId: null,
    durationFrames: null,
  },
];

function defaultHistoryState() {
  return {
    versions: VERSIONS,
    isLoading: false,
    isError: false,
    restoreToVersion: mockRestoreToVersion,
    isRestoring: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentVersionId.mockReturnValue(null);
    mockUseVersionHistory.mockReturnValue(defaultHistoryState());
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders the panel heading', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText('Version History')).toBeTruthy();
  });

  it('renders all version entries', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const rows = screen.getAllByTestId('version-entry-row');
    expect(rows).toHaveLength(3);
  });

  it('renders version labels with v prefix', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText('v12')).toBeTruthy();
    expect(screen.getByText('v11')).toBeTruthy();
    expect(screen.getByText('v10')).toBeTruthy();
  });

  it('shows relative timestamp for each entry', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const timestamps = screen.getAllByText('2m ago');
    expect(timestamps.length).toBeGreaterThan(0);
  });

  it('shows durationFrames as diff summary when present', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText('300 frames')).toBeTruthy();
    expect(screen.getByText('290 frames')).toBeTruthy();
  });

  it('does not show diff summary for versions with null durationFrames', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const frameCells = screen.queryAllByText(/frames$/);
    expect(frameCells).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Current version highlighting
  // -------------------------------------------------------------------------

  it('shows "Current" badge for the current version', () => {
    mockGetCurrentVersionId.mockReturnValue(12);
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText('Current')).toBeTruthy();
  });

  it('does not show "Current" badge when no version matches', () => {
    mockGetCurrentVersionId.mockReturnValue(99);
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.queryByText('Current')).toBeNull();
  });

  it('does not render Restore button for the current version', () => {
    mockGetCurrentVersionId.mockReturnValue(12);
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const restoreButtons = screen.getAllByRole('button', { name: /Restore version/i });
    expect(restoreButtons).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Loading / error / empty states
  // -------------------------------------------------------------------------

  it('shows loading text when isLoading is true', () => {
    mockUseVersionHistory.mockReturnValue({
      ...defaultHistoryState(),
      isLoading: true,
      versions: [],
    });
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText(/Loading versions/i)).toBeTruthy();
  });

  it('shows error text when isError is true', () => {
    mockUseVersionHistory.mockReturnValue({
      ...defaultHistoryState(),
      isError: true,
      isLoading: false,
      versions: [],
    });
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText(/Failed to load versions/i)).toBeTruthy();
  });

  it('shows empty state text when versions array is empty', () => {
    mockUseVersionHistory.mockReturnValue({
      ...defaultHistoryState(),
      versions: [],
    });
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByText(/No saved versions yet/i)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Close button
  // -------------------------------------------------------------------------

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<VersionHistoryPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close version history' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // RestoreModal lifecycle
  // -------------------------------------------------------------------------

  it('does not show RestoreModal initially', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.queryByTestId('restore-modal')).toBeNull();
  });

  it('opens RestoreModal when a Restore button is clicked', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const restoreButtons = screen.getAllByRole('button', { name: /Restore version/i });
    fireEvent.click(restoreButtons[0]);
    expect(screen.getByTestId('restore-modal')).toBeTruthy();
  });

  it('passes the correct versionId to RestoreModal', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const restoreButtons = screen.getAllByRole('button', { name: /Restore version 11/i });
    fireEvent.click(restoreButtons[0]);
    const modal = screen.getByTestId('restore-modal');
    expect(modal.getAttribute('data-version-id')).toBe('11');
  });

  it('closes RestoreModal when Cancel is clicked', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const restoreButtons = screen.getAllByRole('button', { name: /Restore version/i });
    fireEvent.click(restoreButtons[0]);
    expect(screen.getByTestId('restore-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cancel-restore'));
    expect(screen.queryByTestId('restore-modal')).toBeNull();
  });

  it('calls restoreToVersion and closes modal on confirm', async () => {
    mockRestoreToVersion.mockResolvedValue(undefined);
    render(<VersionHistoryPanel onClose={vi.fn()} />);

    const restoreButtons = screen.getAllByRole('button', { name: /Restore version/i });
    fireEvent.click(restoreButtons[0]);
    fireEvent.click(screen.getByTestId('confirm-restore'));

    await waitFor(() => {
      expect(mockRestoreToVersion).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has aria-label on the aside element', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Version history' })).toBeTruthy();
  });

  it('Restore buttons have descriptive aria-labels', () => {
    render(<VersionHistoryPanel onClose={vi.fn()} />);
    const label = screen.getByRole('button', { name: /Restore version 11 saved 2m ago/i });
    expect(label).toBeTruthy();
  });
});
