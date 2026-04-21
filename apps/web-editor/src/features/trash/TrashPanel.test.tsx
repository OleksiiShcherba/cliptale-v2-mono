import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockListTrash, mockRestoreTrashItem } = vi.hoisted(() => ({
  mockListTrash: vi.fn(),
  mockRestoreTrashItem: vi.fn(),
}));

vi.mock('./api', () => ({
  listTrash: mockListTrash,
  restoreTrashItem: mockRestoreTrashItem,
}));

import { TrashPanel } from './TrashPanel';
import type { TrashItem } from './api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<TrashItem> = {}): TrashItem {
  return {
    id: 'item-001',
    kind: 'file',
    name: 'my-video.mp4',
    deletedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/trash']}>
        <TrashPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TrashPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders loading text while the query is in flight', async () => {
      // Never resolves so the panel stays in loading state
      mockListTrash.mockImplementation(() => new Promise(() => {}));
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText(/loading/i)).toBeDefined();
      });
    });
  });

  describe('error state', () => {
    it('renders an error alert when listTrash rejects', async () => {
      mockListTrash.mockRejectedValue(new Error('network error'));
      renderPanel();
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
      });
    });

    it('error message mentions trying again', async () => {
      mockListTrash.mockRejectedValue(new Error('network error'));
      renderPanel();
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toMatch(/try again/i);
      });
    });
  });

  describe('empty state', () => {
    it('renders an empty state when the trash list is empty', async () => {
      mockListTrash.mockResolvedValue([]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText(/trash is empty/i)).toBeDefined();
      });
    });
  });

  describe('populated state', () => {
    it('renders one row per item', async () => {
      mockListTrash.mockResolvedValue([
        makeItem({ id: 'a', name: 'alpha.mp4' }),
        makeItem({ id: 'b', name: 'beta.png', kind: 'file' }),
      ]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText('alpha.mp4')).toBeDefined();
        expect(screen.getByText('beta.png')).toBeDefined();
      });
    });

    it('shows a kind badge for each item', async () => {
      mockListTrash.mockResolvedValue([
        makeItem({ id: 'p', name: 'My Project', kind: 'project' }),
      ]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByLabelText(/kind: project/i)).toBeDefined();
      });
    });

    it('shows a Restore button for each item', async () => {
      mockListTrash.mockResolvedValue([makeItem()]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /restore my-video\.mp4/i })).toBeDefined();
      });
    });

    it('calls restoreTrashItem when Restore is clicked', async () => {
      mockRestoreTrashItem.mockResolvedValue(undefined);
      const item = makeItem();
      mockListTrash.mockResolvedValue([item]);
      renderPanel();
      await waitFor(() => screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      fireEvent.click(screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      await waitFor(() => expect(mockRestoreTrashItem).toHaveBeenCalledWith(item));
    });

    it('shows "Restoring…" while the request is in-flight', async () => {
      mockRestoreTrashItem.mockImplementation(() => new Promise(() => {}));
      const item = makeItem();
      mockListTrash.mockResolvedValue([item]);
      renderPanel();
      await waitFor(() => screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      fireEvent.click(screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /restore my-video\.mp4/i }).textContent).toMatch(/restoring/i),
      );
    });

    it('shows a row error alert when restoreTrashItem rejects', async () => {
      mockRestoreTrashItem.mockRejectedValue(new Error('Server error'));
      const item = makeItem();
      mockListTrash.mockResolvedValue([item]);
      renderPanel();
      await waitFor(() => screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      fireEvent.click(screen.getByRole('button', { name: /restore my-video\.mp4/i }));
      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    });
  });

  describe('page structure', () => {
    it('renders a page heading "Trash"', async () => {
      mockListTrash.mockResolvedValue([]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /trash/i })).toBeDefined();
      });
    });

    it('renders a back button', async () => {
      mockListTrash.mockResolvedValue([]);
      renderPanel();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back/i })).toBeDefined();
      });
    });
  });
});
