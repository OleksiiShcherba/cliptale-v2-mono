/**
 * Tests for LibraryPanel component.
 *
 * Covers:
 * - Renders panel header with Library title and "+ New Scene" button
 * - Search input is present
 * - Empty state shown when templates list is empty
 * - Template cards rendered for each template
 * - "Add to Storyboard" delegates to onAddTemplate prop + switches tab
 * - "+ New Scene" opens SceneModal in template-create mode
 * - Edit button on card opens SceneModal in template-edit mode
 * - Delete button on card calls removeTemplate
 * - Loading state shown while fetching
 * - Error banner shown on fetch error
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockTemplates,
  mockIsLoading,
  mockError,
  mockFilterText,
  mockSetFilterText,
  mockCreateTemplate,
  mockUpdateTemplate,
  mockRemoveTemplate,
  mockAddToStoryboard,
} = vi.hoisted(() => ({
  mockTemplates: { current: [] as ReturnType<typeof makeTemplate>[] },
  mockIsLoading: { current: false },
  mockError: { current: null as string | null },
  mockFilterText: { current: '' },
  mockSetFilterText: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockRemoveTemplate: vi.fn(),
  mockAddToStoryboard: vi.fn(),
}));

vi.mock('@/features/storyboard/hooks/useSceneTemplates', () => ({
  useSceneTemplates: () => ({
    templates: mockTemplates.current,
    isLoading: mockIsLoading.current,
    error: mockError.current,
    filterText: mockFilterText.current,
    setFilterText: mockSetFilterText,
    createTemplate: mockCreateTemplate,
    updateTemplate: mockUpdateTemplate,
    removeTemplate: mockRemoveTemplate,
    addToStoryboard: mockAddToStoryboard,
  }),
}));

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url + '?token=test',
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));

// Mock AssetPickerModal to avoid complex internals in panel test
vi.mock('@/features/generate-wizard/components/AssetPickerModal', () => ({
  AssetPickerModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="asset-picker-modal">
      <button type="button" onClick={onClose}>Close picker</button>
    </div>
  ),
}));

vi.mock('@ai-video-editor/api-contracts', () => ({
  STORYBOARD_STYLES: [
    { id: 'cyberpunk', label: 'Cyberpunk', description: 'Neon', previewColor: '#00FFFF' },
  ],
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { LibraryPanel } from '../components/LibraryPanel';
import type { SceneTemplate } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<SceneTemplate> = {}): SceneTemplate {
  return {
    id: 'tpl-1',
    userId: 'user-1',
    name: 'My Template',
    prompt: 'A great scene',
    durationS: 10,
    style: null,
    mediaItems: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultProps = {
  draftId: 'draft-1',
  onSwitchToStoryboard: vi.fn(),
  onAddTemplate: vi.fn().mockResolvedValue(undefined),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LibraryPanel', () => {
  beforeEach(() => {
    mockTemplates.current = [];
    mockIsLoading.current = false;
    mockError.current = null;
    mockFilterText.current = '';
    vi.clearAllMocks();
    defaultProps.onSwitchToStoryboard = vi.fn();
    defaultProps.onAddTemplate = vi.fn().mockResolvedValue(undefined);
  });

  describe('layout', () => {
    it('renders panel with Library heading and New Scene button', () => {
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.getByTestId('library-panel')).toBeTruthy();
      expect(screen.getByTestId('new-scene-button')).toBeTruthy();
      expect(screen.getByTestId('library-search-input')).toBeTruthy();
    });

    it('shows empty state when no templates', () => {
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.getByTestId('library-empty-state')).toBeTruthy();
      expect(screen.getByTestId('library-empty-state').textContent).toContain('No templates yet');
    });

    it('shows loading indicator while fetching', () => {
      mockIsLoading.current = true;
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.getByTestId('library-loading')).toBeTruthy();
    });

    it('shows error banner on fetch error', () => {
      mockError.current = 'Network error';
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.getByTestId('library-error')).toBeTruthy();
      expect(screen.getByTestId('library-error').textContent).toContain('Network error');
    });
  });

  describe('template cards', () => {
    it('renders a card for each template', () => {
      mockTemplates.current = [
        makeTemplate({ id: 'a', name: 'Scene A' }),
        makeTemplate({ id: 'b', name: 'Scene B' }),
      ];
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.getByTestId('template-card-a')).toBeTruthy();
      expect(screen.getByTestId('template-card-b')).toBeTruthy();
    });

    it('does not show empty state when templates exist', () => {
      mockTemplates.current = [makeTemplate()];
      render(<LibraryPanel {...defaultProps} />);
      expect(screen.queryByTestId('library-empty-state')).toBeFalsy();
    });
  });

  describe('add to storyboard', () => {
    it('calls onAddTemplate + onSwitchToStoryboard on Add click', async () => {
      mockTemplates.current = [makeTemplate()];
      render(<LibraryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('add-template-tpl-1'));

      await waitFor(() => {
        expect(defaultProps.onAddTemplate).toHaveBeenCalledWith('tpl-1');
        expect(defaultProps.onSwitchToStoryboard).toHaveBeenCalled();
      });
    });

    it('disables the Add button while onAddTemplate is in flight', async () => {
      let resolveAdd!: () => void;
      defaultProps.onAddTemplate = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => { resolveAdd = resolve; }),
      );
      mockTemplates.current = [makeTemplate()];
      render(<LibraryPanel {...defaultProps} />);

      const addBtn = screen.getByTestId('add-template-tpl-1');
      fireEvent.click(addBtn);

      // The card should be disabled (isAdding=true) while promise is pending.
      expect(addBtn.hasAttribute('disabled')).toBe(true);

      // Resolve — disabled state should clear.
      await act(async () => { resolveAdd(); await Promise.resolve(); });
      expect(addBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('new scene modal', () => {
    it('opens SceneModal when New Scene button is clicked', () => {
      render(<LibraryPanel {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-scene-button'));
      expect(screen.getByTestId('scene-modal')).toBeTruthy();
    });

    it('closes SceneModal when Cancel is clicked', () => {
      render(<LibraryPanel {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-scene-button'));
      expect(screen.getByTestId('scene-modal')).toBeTruthy();
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(screen.queryByTestId('scene-modal')).toBeFalsy();
    });

    it('calls createTemplate when template modal is saved', async () => {
      mockCreateTemplate.mockResolvedValue(makeTemplate());
      render(<LibraryPanel {...defaultProps} />);
      fireEvent.click(screen.getByTestId('new-scene-button'));

      // Fill required prompt field
      fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'A scene prompt' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalled();
        const payload = mockCreateTemplate.mock.calls[0][0] as { prompt: string };
        expect(payload.prompt).toBe('A scene prompt');
      });
    });
  });

  describe('edit template', () => {
    it('opens SceneModal with template values when Edit is clicked', () => {
      const template = makeTemplate({ name: 'My Template', prompt: 'Existing prompt' });
      mockTemplates.current = [template];
      render(<LibraryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('edit-template-tpl-1'));
      expect(screen.getByTestId('scene-modal')).toBeTruthy();

      // The prompt should be pre-filled
      const promptInput = screen.getByTestId('prompt-input') as HTMLTextAreaElement;
      expect(promptInput.value).toBe('Existing prompt');
    });

    it('calls updateTemplate when edited template is saved', async () => {
      const template = makeTemplate({ name: 'My Template', prompt: 'Old prompt' });
      mockTemplates.current = [template];
      mockUpdateTemplate.mockResolvedValue({ ...template, prompt: 'New prompt' });
      render(<LibraryPanel {...defaultProps} />);

      fireEvent.click(screen.getByTestId('edit-template-tpl-1'));
      fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'New prompt' } });
      fireEvent.click(screen.getByTestId('save-button'));

      await waitFor(() => {
        expect(mockUpdateTemplate).toHaveBeenCalledWith('tpl-1', expect.objectContaining({ prompt: 'New prompt' }));
      });
    });
  });

  describe('delete template', () => {
    it('calls removeTemplate on first delete click (confirm) then second click', async () => {
      mockTemplates.current = [makeTemplate()];
      mockRemoveTemplate.mockResolvedValue(undefined);
      render(<LibraryPanel {...defaultProps} />);

      // First click shows "Confirm" label
      const deleteBtn = screen.getByTestId('delete-template-tpl-1');
      fireEvent.click(deleteBtn);
      expect(deleteBtn.textContent).toBe('Confirm');

      // Second click confirms
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(mockRemoveTemplate).toHaveBeenCalledWith('tpl-1');
      });
    });
  });

  describe('search', () => {
    it('calls setFilterText when search input changes', () => {
      render(<LibraryPanel {...defaultProps} />);
      fireEvent.change(screen.getByTestId('library-search-input'), { target: { value: 'space' } });
      expect(mockSetFilterText).toHaveBeenCalledWith('space');
    });
  });
});
