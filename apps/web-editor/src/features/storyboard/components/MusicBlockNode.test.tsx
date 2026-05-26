import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { MusicBlockNodeData } from '../types';
import { MusicBlockNode } from './MusicBlockNode';

const DATA: MusicBlockNodeData = {
  musicBlock: {
    id: 'music-1',
    draftId: 'draft-1',
    name: 'Opening music',
    sourceMode: 'generate_on_step3',
    prompt: 'Soft pulse',
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
    generationStatus: null,
    generationJobId: null,
    outputFileId: null,
    errorMessage: null,
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
  },
  rangeLabel: 'Opening - Close',
  sourceLabel: 'Auto later',
  statusLabel: 'Pending',
  isActive: false,
  onEdit: vi.fn(),
  onHover: vi.fn(),
};

describe('MusicBlockNode', () => {
  it('renders compact music metadata and preview affordance', () => {
    render(<MusicBlockNode id="music-1" data={DATA} />);

    expect(screen.getByTestId('music-block-title').textContent).toBe('Opening music');
    expect(screen.getByTestId('music-source-badge').textContent).toBe('Auto later');
    expect(screen.getByTestId('music-status-badge').textContent).toBe('Pending');
    expect(screen.getByTestId('music-range-label').textContent).toBe('Opening - Close');
    expect(screen.getByTestId('music-preview-affordance')).toBeTruthy();
  });

  it('opens and highlights through node callbacks', () => {
    const onEdit = vi.fn();
    const onHover = vi.fn();
    render(<MusicBlockNode id="music-1" data={{ ...DATA, onEdit, onHover }} />);

    fireEvent.mouseEnter(screen.getByTestId('music-block-node'));
    fireEvent.click(screen.getByTestId('music-block-node'));
    fireEvent.mouseLeave(screen.getByTestId('music-block-node'));

    expect(onHover).toHaveBeenCalledWith('music-1');
    expect(onEdit).toHaveBeenCalledWith('music-1');
    expect(onHover).toHaveBeenCalledWith(null);
  });
});
