/**
 * Tests for EffectsPanel component.
 *
 * Covers:
 * - Renders 3 style cards from STORYBOARD_STYLES
 * - Each card shows label, description, and color swatch
 * - Clicking a card opens the apply-dialog
 * - Clicking the same card again closes the dialog
 * - "Apply to this scene" is disabled (and shows hint) when selectedBlockId is null
 * - "Apply to this scene" is enabled and calls applyStyleToBlock when block selected
 * - "Apply to all scenes" always enabled and calls applyStyleToAllBlocks
 * - Dialog closes after apply action
 * - Animation section renders with "Coming soon" badge and disabled items
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockApplyStyleToBlock, mockApplyStyleToAllBlocks } = vi.hoisted(() => ({
  mockApplyStyleToBlock: vi.fn(),
  mockApplyStyleToAllBlocks: vi.fn(),
}));

vi.mock('@/features/storyboard/store/storyboard-store', () => ({
  applyStyleToBlock: mockApplyStyleToBlock,
  applyStyleToAllBlocks: mockApplyStyleToAllBlocks,
  subscribe: vi.fn(() => vi.fn()),
  getSnapshot: vi.fn(() => ({
    nodes: [],
    edges: [],
    positions: {},
    selectedBlockId: null,
  })),
}));

vi.mock('@ai-video-editor/api-contracts', () => ({
  STORYBOARD_STYLES: [
    {
      id: 'cyberpunk',
      label: 'Cyberpunk',
      description: 'Neon-lit dystopian future',
      previewColor: '#00FFFF',
    },
    {
      id: 'cinematic-glow',
      label: 'Cinematic Glow',
      description: 'Warm hazy golden-hour photography',
      previewColor: '#F5A623',
    },
    {
      id: 'film-noir',
      label: 'Film Noir',
      description: 'High-contrast black-and-white',
      previewColor: '#2A2A2A',
    },
  ],
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { EffectsPanel } from '../components/EffectsPanel';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EffectsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('layout', () => {
    it('renders the Visual Styles section heading', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('visual-styles-heading')).toBeDefined();
    });

    it('renders 3 style cards', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('style-card-cyberpunk')).toBeDefined();
      expect(screen.getByTestId('style-card-cinematic-glow')).toBeDefined();
      expect(screen.getByTestId('style-card-film-noir')).toBeDefined();
    });

    it('renders style labels', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByText('Cyberpunk')).toBeDefined();
      expect(screen.getByText('Cinematic Glow')).toBeDefined();
      expect(screen.getByText('Film Noir')).toBeDefined();
    });

    it('renders style descriptions', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByText('Neon-lit dystopian future')).toBeDefined();
      expect(screen.getByText('Warm hazy golden-hour photography')).toBeDefined();
      expect(screen.getByText('High-contrast black-and-white')).toBeDefined();
    });

    it('renders color swatches for each style', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('style-swatch-cyberpunk')).toBeDefined();
      expect(screen.getByTestId('style-swatch-cinematic-glow')).toBeDefined();
      expect(screen.getByTestId('style-swatch-film-noir')).toBeDefined();
    });

    it('renders the Animation section', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('animation-section')).toBeDefined();
    });

    it('renders the "Coming soon" badge in the Animation section', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('coming-soon-badge')).toBeDefined();
      expect(screen.getByTestId('coming-soon-badge').textContent).toContain('Coming soon');
    });

    it('renders animation stub items with aria-disabled', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      expect(screen.getByTestId('animation-item-fade-in')).toBeDefined();
      expect(screen.getByTestId('animation-item-slide-up')).toBeDefined();
      expect(screen.getByTestId('animation-item-zoom-in')).toBeDefined();
      expect(screen.getByTestId('animation-item-fade-in').getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('style card click → apply dialog', () => {
    it('shows the apply dialog when a style card is clicked', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      expect(card).not.toBeNull();
      fireEvent.click(card!);
      expect(screen.getByTestId('apply-dialog-cyberpunk')).toBeDefined();
    });

    it('closes the dialog when the same card is clicked again', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);
      expect(screen.getByTestId('apply-dialog-cyberpunk')).toBeDefined();
      fireEvent.click(card!);
      expect(screen.queryByTestId('apply-dialog-cyberpunk')).toBeNull();
    });

    it('shows only one dialog at a time when different cards are clicked', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const cyberpunkBtn = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      const filmNoirBtn = screen.getByTestId('style-card-film-noir').querySelector('button');

      fireEvent.click(cyberpunkBtn!);
      expect(screen.getByTestId('apply-dialog-cyberpunk')).toBeDefined();
      expect(screen.queryByTestId('apply-dialog-film-noir')).toBeNull();

      fireEvent.click(filmNoirBtn!);
      expect(screen.queryByTestId('apply-dialog-cyberpunk')).toBeNull();
      expect(screen.getByTestId('apply-dialog-film-noir')).toBeDefined();
    });
  });

  describe('"Apply to this scene" button — no selection', () => {
    it('is disabled when selectedBlockId is null', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyBtn = screen.getByTestId('apply-to-scene-button') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);
    });

    it('shows "Select a scene first" hint text when no block selected', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      expect(screen.getByTestId('apply-to-scene-hint')).toBeDefined();
      expect(screen.getByTestId('apply-to-scene-hint').textContent).toContain('Select a scene first');
    });

    it('does not call applyStyleToBlock when clicked while disabled', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyBtn = screen.getByTestId('apply-to-scene-button');
      fireEvent.click(applyBtn);
      expect(mockApplyStyleToBlock).not.toHaveBeenCalled();
    });
  });

  describe('"Apply to this scene" button — block selected', () => {
    it('is enabled when selectedBlockId is set', () => {
      render(<EffectsPanel selectedBlockId="block-1" />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyBtn = screen.getByTestId('apply-to-scene-button') as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(false);
    });

    it('does not show the hint text when a block is selected', () => {
      render(<EffectsPanel selectedBlockId="block-1" />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      expect(screen.queryByTestId('apply-to-scene-hint')).toBeNull();
    });

    it('calls applyStyleToBlock with blockId and styleId on click', () => {
      render(<EffectsPanel selectedBlockId="block-1" />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyBtn = screen.getByTestId('apply-to-scene-button');
      fireEvent.click(applyBtn);
      expect(mockApplyStyleToBlock).toHaveBeenCalledWith('block-1', 'cyberpunk');
    });

    it('closes the dialog after applying to scene', () => {
      render(<EffectsPanel selectedBlockId="block-1" />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyBtn = screen.getByTestId('apply-to-scene-button');
      fireEvent.click(applyBtn);
      expect(screen.queryByTestId('apply-dialog-cyberpunk')).toBeNull();
    });
  });

  describe('"Apply to all scenes" button', () => {
    it('renders the apply-to-all button inside the dialog', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      expect(screen.getByTestId('apply-to-all-button')).toBeDefined();
    });

    it('calls applyStyleToAllBlocks with the styleId on click', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-film-noir').querySelector('button');
      fireEvent.click(card!);

      const applyAllBtn = screen.getByTestId('apply-to-all-button');
      fireEvent.click(applyAllBtn);
      expect(mockApplyStyleToAllBlocks).toHaveBeenCalledWith('film-noir');
    });

    it('closes the dialog after applying to all', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyAllBtn = screen.getByTestId('apply-to-all-button');
      fireEvent.click(applyAllBtn);
      expect(screen.queryByTestId('apply-dialog-cyberpunk')).toBeNull();
    });

    it('is NOT disabled even when no block is selected', () => {
      render(<EffectsPanel selectedBlockId={null} />);
      const card = screen.getByTestId('style-card-cyberpunk').querySelector('button');
      fireEvent.click(card!);

      const applyAllBtn = screen.getByTestId('apply-to-all-button') as HTMLButtonElement;
      expect(applyAllBtn.disabled).toBe(false);
    });
  });
});
