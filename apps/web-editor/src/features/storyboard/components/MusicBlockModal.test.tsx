import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { StoryboardBlock, StoryboardMusicBlock } from '@/features/storyboard/types';

import { MusicBlockModal } from './MusicBlockModal';
import { musicBlockModalStyles } from './MusicBlockModal.styles';

const { mockUseAssets } = vi.hoisted(() => ({
  mockUseAssets: vi.fn(),
}));

vi.mock('@/features/generate-wizard/hooks/useAssets', () => ({
  useAssets: mockUseAssets,
}));

const SCENES: StoryboardBlock[] = [
  {
    id: 'scene-1',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Opening',
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: 200,
    positionY: 200,
    sortOrder: 1,
    style: null,
    mediaItems: [],
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  },
  {
    id: 'scene-2',
    draftId: 'draft-1',
    blockType: 'scene',
    name: 'Close',
    prompt: null,
    videoPrompt: null,
    durationS: 5,
    positionX: 480,
    positionY: 200,
    sortOrder: 2,
    style: null,
    mediaItems: [],
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  },
];

const MUSIC_BLOCK: StoryboardMusicBlock = {
  id: 'music-1',
  draftId: 'draft-1',
  name: 'Opening music',
  sourceMode: 'generate_now',
  prompt: 'Soft ambient pulse',
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: 'scene-1',
  endSceneBlockId: 'scene-2',
  positionX: 120,
  positionY: 520,
  sortOrder: 0,
  volume: 0.8,
  fadeInS: 0,
  fadeOutS: 1,
  loopMode: 'trim',
  generationStatus: 'failed',
  generationJobId: 'job-1',
  outputFileId: null,
  errorMessage: 'Provider failed',
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-05-26T00:00:00Z',
};

function renderModal(overrides: Partial<StoryboardMusicBlock> = {}) {
  const onChange = vi.fn();
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <MusicBlockModal
      draftId="draft-1"
      block={{ ...MUSIC_BLOCK, ...overrides }}
      orderedScenes={SCENES}
      isGenerating={false}
      error={null}
      onChange={onChange}
      onGenerate={onGenerate}
      onClose={onClose}
    />,
  );
  return { onChange, onGenerate, onClose };
}

describe('MusicBlockModal', () => {
  beforeEach(() => {
    mockUseAssets.mockReturnValue({
      data: {
        items: [
          {
            id: 'audio-1',
            type: 'audio',
            label: 'Theme.wav',
            durationSeconds: 30,
            thumbnailUrl: null,
            createdAt: '2026-05-26T00:00:00Z',
          },
        ],
        nextCursor: null,
        totals: { count: 1, bytesUsed: 10 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('edits source mode, range, volume, fades, and loop mode', () => {
    const { onChange } = renderModal();

    fireEvent.click(screen.getByText('Existing track'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sourceMode: 'existing' }));

    fireEvent.change(screen.getByTestId('music-start-scene-select'), { target: { value: 'scene-2' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      startSceneBlockId: 'scene-2',
      endSceneBlockId: 'scene-2',
    }));

    fireEvent.change(screen.getByTestId('music-volume'), { target: { value: '0.42' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ volume: 0.42 }));

    fireEvent.change(screen.getByTestId('music-loop-mode'), { target: { value: 'loop' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ loopMode: 'loop' }));

    fireEvent.change(screen.getByTestId('music-fade-in'), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fadeInS: 1.5 }));
  });

  it('filters the existing picker to audio assets', () => {
    renderModal({ sourceMode: 'existing', existingFileId: 'audio-1' });

    const picker = screen.getByTestId('music-audio-picker') as HTMLSelectElement;
    expect(picker.value).toBe('audio-1');
    expect(screen.getByText('Theme.wav')).toBeTruthy();
    expect(mockUseAssets).toHaveBeenCalledWith({ type: 'audio', draftId: 'draft-1', scope: 'all' });
  });

  it('selects an existing audio asset through onChange', () => {
    const { onChange } = renderModal({ sourceMode: 'existing', existingFileId: null });

    fireEvent.change(screen.getByTestId('music-audio-picker'), { target: { value: 'audio-1' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ existingFileId: 'audio-1' }));
  });

  it('wires generate retry controls', () => {
    const { onGenerate } = renderModal();
    fireEvent.click(screen.getByTestId('music-generate-button'));
    expect(onGenerate).toHaveBeenCalledWith(MUSIC_BLOCK);
  });

  it('edits only the active music block prompt and keeps the plan visible', () => {
    const plan = {
      positive_global_styles: ['warm'],
      negative_global_styles: ['vocals'],
      sections: [
        {
          section_name: 'Main',
          positive_local_styles: ['piano'],
          negative_local_styles: [],
          duration_ms: 12_000,
          lines: [],
        },
      ],
    };
    const { onChange } = renderModal({ compositionPlan: plan });

    fireEvent.change(screen.getByTestId('music-prompt'), {
      target: { value: 'Edited cue for this block only' },
    });

    expect(screen.getByTestId('music-plan-summary').textContent).toContain('1 sections / 12s');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      id: MUSIC_BLOCK.id,
      prompt: 'Edited cue for this block only',
      compositionPlan: plan,
    }));
  });

  it('focuses the dialog and closes on Escape', () => {
    const { onClose } = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Music block inspector' });

    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('centers the modal while keeping viewport margins and internal scrolling', () => {
    renderModal();

    const backdrop = screen.getByTestId('music-block-modal');
    const dialog = screen.getByRole('dialog', { name: 'Music block inspector' });

    expect(backdrop.style.alignItems).toBe('center');
    expect(backdrop.style.justifyContent).toBe('center');
    expect(dialog.style.maxHeight).toBe('calc(100vh - 32px)');
    expect(dialog.style.margin).toBe('16px');
    expect(dialog.style.overflow).toBe('auto');
    expect(musicBlockModalStyles.backdrop.justifyContent).toBe('center');
    expect(musicBlockModalStyles.panel.width).toBe('min(420px, calc(100vw - 32px))');
    expect(musicBlockModalStyles.panel.maxHeight).toBe('calc(100vh - 32px)');
  });

  it('only shows generate controls for generate_now music', () => {
    renderModal({ sourceMode: 'generate_on_step3' });
    expect(screen.queryByTestId('music-generate-button')).toBeNull();
  });
});
