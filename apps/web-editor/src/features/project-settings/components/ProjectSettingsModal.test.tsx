import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FPS_PRESETS, RESOLUTION_PRESETS, ProjectSettingsModal } from './ProjectSettingsModal';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSnapshot = vi.fn();
const mockSetProject = vi.fn();
const mockUseProjectStore = vi.fn();

vi.mock('@/store/project-store', () => ({
  getSnapshot: () => mockGetSnapshot(),
  setProject: (doc: unknown) => mockSetProject(doc),
  useProjectStore: () => mockUseProjectStore(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProjectDoc(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 900,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(makeProjectDoc());
    mockGetSnapshot.mockReturnValue(makeProjectDoc());
  });

  describe('dialog structure', () => {
    it('renders as a dialog with correct aria attributes', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('project-settings-title');
    });

    it('renders the title "Project Settings"', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      expect(screen.getByText('Project Settings')).toBeDefined();
    });

    it('renders a close button', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Close project settings' })).toBeDefined();
    });

    it('calls onClose when the close button is clicked', () => {
      const onClose = vi.fn();
      render(<ProjectSettingsModal onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close project settings' }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<ProjectSettingsModal onClose={onClose} />);
      fireEvent.click(screen.getByTestId('project-settings-backdrop'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose when the dialog panel content is clicked', () => {
      const onClose = vi.fn();
      render(<ProjectSettingsModal onClose={onClose} />);
      fireEvent.click(screen.getByRole('dialog'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('FPS presets', () => {
    it('renders all FPS preset buttons', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      for (const fps of FPS_PRESETS) {
        expect(screen.getByRole('button', { name: `${fps} fps` })).toBeDefined();
      }
    });

    it('marks the current FPS preset as pressed', () => {
      mockUseProjectStore.mockReturnValue(makeProjectDoc({ fps: 30 }));
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: '30 fps' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: '24 fps' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('calls setProject with the new fps when a preset is clicked', () => {
      const doc = makeProjectDoc({ fps: 30 });
      mockUseProjectStore.mockReturnValue(doc);
      mockGetSnapshot.mockReturnValue(doc);
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: '24 fps' }));
      expect(mockSetProject).toHaveBeenCalledWith({ ...doc, fps: 24 });
    });

    it('calls setProject with 60 fps when the 60fps preset is clicked', () => {
      const doc = makeProjectDoc({ fps: 30 });
      mockUseProjectStore.mockReturnValue(doc);
      mockGetSnapshot.mockReturnValue(doc);
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: '60 fps' }));
      expect(mockSetProject).toHaveBeenCalledWith({ ...doc, fps: 60 });
    });
  });

  describe('resolution presets', () => {
    it('renders all resolution preset buttons', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      for (const preset of RESOLUTION_PRESETS) {
        expect(screen.getByRole('button', { name: new RegExp(preset.label) })).toBeDefined();
      }
    });

    it('marks the current resolution preset as pressed (1920×1080 default)', () => {
      mockUseProjectStore.mockReturnValue(makeProjectDoc({ width: 1920, height: 1080 }));
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /^1080p/i });
      expect(btn.getAttribute('aria-pressed')).toBe('true');
    });

    it('marks non-matching resolution presets as not pressed', () => {
      mockUseProjectStore.mockReturnValue(makeProjectDoc({ width: 1920, height: 1080 }));
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      expect(screen.getByRole('button', { name: /^720p/i }).getAttribute('aria-pressed')).toBe('false');
    });

    it('calls setProject with new width and height when a resolution preset is clicked', () => {
      const doc = makeProjectDoc({ width: 1920, height: 1080 });
      mockUseProjectStore.mockReturnValue(doc);
      mockGetSnapshot.mockReturnValue(doc);
      const vertical = RESOLUTION_PRESETS.find(p => p.id === 'vertical')!;
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /vertical/i }));
      expect(mockSetProject).toHaveBeenCalledWith({ ...doc, width: vertical.width, height: vertical.height });
    });

    it('shows platform labels inside resolution preset buttons', () => {
      render(<ProjectSettingsModal onClose={vi.fn()} />);
      expect(screen.getAllByText('YouTube (16:9)').length).toBeGreaterThan(0);
      expect(screen.getByText('Shorts · TikTok (9:16)')).toBeDefined();
      expect(screen.getByText('Instagram (1:1)')).toBeDefined();
    });
  });
});
