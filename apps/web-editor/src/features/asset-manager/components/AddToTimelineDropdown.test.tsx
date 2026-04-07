import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { AddToTimelineDropdown } from './AddToTimelineDropdown';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAddAssetToNewTrack = vi.fn();
const mockAddAssetToExistingTrack = vi.fn();

vi.mock('@/features/asset-manager/hooks/useAddAssetToTimeline', () => ({
  useAddAssetToTimeline: () => ({
    addAssetToNewTrack: mockAddAssetToNewTrack,
    addAssetToExistingTrack: mockAddAssetToExistingTrack,
  }),
}));

const mockUseTracksForAsset = vi.hoisted(() => vi.fn<() => Track[]>(() => []));
vi.mock('@/features/asset-manager/hooks/useTracksForAsset', () => ({
  useTracksForAsset: mockUseTracksForAsset,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/clip.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-001',
    type: 'video',
    name: 'Main',
    muted: false,
    locked: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddToTimelineDropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTracksForAsset.mockReturnValue([]);
  });

  describe('trigger button', () => {
    it('renders the trigger button with accessible label', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      expect(screen.getByRole('button', { name: /add clip\.mp4 to timeline/i })).toBeDefined();
    });

    it('is enabled by default', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('is disabled when disabled prop is true', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" disabled />);
      const btn = screen.getByRole('button', { name: /add.*timeline/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('does not open dropdown when disabled', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" disabled />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });

  describe('dropdown opening', () => {
    it('opens the dropdown on trigger click', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByRole('listbox')).toBeDefined();
    });

    it('closes the dropdown on second trigger click', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      const trigger = screen.getByRole('button', { name: /add.*timeline/i });
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('has aria-expanded=false when closed', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      const trigger = screen.getByRole('button', { name: /add.*timeline/i });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('has aria-expanded=true when open', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      const trigger = screen.getByRole('button', { name: /add.*timeline/i });
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('dropdown items — no existing tracks', () => {
    it('shows "To New Video Track" for video/* asset', () => {
      render(<AddToTimelineDropdown asset={makeAsset({ contentType: 'video/mp4' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByText('To New Video Track')).toBeDefined();
    });

    it('shows "To New Audio Track" for audio/* asset', () => {
      render(<AddToTimelineDropdown asset={makeAsset({ contentType: 'audio/mpeg' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByText('To New Audio Track')).toBeDefined();
    });

    it('shows "To New Video Track" for image/* asset', () => {
      render(<AddToTimelineDropdown asset={makeAsset({ contentType: 'image/png' })} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByText('To New Video Track')).toBeDefined();
    });

    it('does not show existing tracks section when there are none', () => {
      mockUseTracksForAsset.mockReturnValue([]);
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.queryByText(/existing.*tracks/i)).toBeNull();
    });
  });

  describe('dropdown items — with existing tracks', () => {
    it('shows existing track names in the dropdown', () => {
      mockUseTracksForAsset.mockReturnValue([
        makeTrack({ id: 't1', name: 'Main Video' }),
        makeTrack({ id: 't2', name: 'B-Roll' }),
      ]);
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByText('To Existing: Main Video')).toBeDefined();
      expect(screen.getByText('To Existing: B-Roll')).toBeDefined();
    });

    it('shows a section label when existing tracks are present', () => {
      mockUseTracksForAsset.mockReturnValue([makeTrack({ name: 'Main' })]);
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      expect(screen.getByText(/existing video tracks/i)).toBeDefined();
    });
  });

  describe('actions', () => {
    it('calls addAssetToNewTrack with the asset when "To New Track" is clicked', () => {
      const asset = makeAsset();
      render(<AddToTimelineDropdown asset={asset} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      fireEvent.click(screen.getByText('To New Video Track'));
      expect(mockAddAssetToNewTrack).toHaveBeenCalledWith(asset);
    });

    it('closes the dropdown after selecting "To New Track"', () => {
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      fireEvent.click(screen.getByText('To New Video Track'));
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('calls addAssetToExistingTrack with asset and trackId when an existing track is clicked', () => {
      const asset = makeAsset();
      mockUseTracksForAsset.mockReturnValue([makeTrack({ id: 'track-abc', name: 'Main Video' })]);
      render(<AddToTimelineDropdown asset={asset} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      fireEvent.click(screen.getByText('To Existing: Main Video'));
      expect(mockAddAssetToExistingTrack).toHaveBeenCalledWith(asset, 'track-abc');
    });

    it('closes the dropdown after selecting an existing track', () => {
      mockUseTracksForAsset.mockReturnValue([makeTrack({ id: 't1', name: 'Main' })]);
      render(<AddToTimelineDropdown asset={makeAsset()} projectId="proj-001" />);
      fireEvent.click(screen.getByRole('button', { name: /add.*timeline/i }));
      fireEvent.click(screen.getByText('To Existing: Main'));
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });
});
