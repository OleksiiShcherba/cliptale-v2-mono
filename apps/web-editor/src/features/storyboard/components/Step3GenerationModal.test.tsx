import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiModel } from '@/shared/ai-generation/types';

const { mockListModels } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listModels: mockListModels,
}));

import { Step3GenerationModal } from './Step3GenerationModal';

function makeModel(id: string, fields: Array<{ name: string }> = []): AiModel {
  return {
    id,
    provider: 'fal',
    label: id,
    capability: 'image_to_video',
    inputSchema: { fields },
  } as unknown as AiModel;
}

describe('Step3GenerationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads image-to-video models and starts generation with the selected model', async () => {
    const onGenerate = vi.fn();
    mockListModels.mockResolvedValue({
      image_to_video: [makeModel('fal-ai/first'), makeModel('fal-ai/second')],
    });

    render(
      <Step3GenerationModal
        isBusy={false}
        error={null}
        onClose={vi.fn()}
        onSkip={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    await waitFor(() => expect(screen.getByDisplayValue('fal-ai/first')).toBeTruthy());
    fireEvent.change(screen.getByTestId('step3-video-model-select'), { target: { value: 'fal-ai/second' } });
    fireEvent.click(screen.getByTestId('step3-start-videos-button'));

    expect(onGenerate).toHaveBeenCalledWith({ modelId: 'fal-ai/second', generateAudio: false });
  });

  it('enables audio only when the selected model supports an audio field', async () => {
    const onGenerate = vi.fn();
    mockListModels.mockResolvedValue({
      image_to_video: [
        makeModel('fal-ai/no-audio'),
        makeModel('fal-ai/audio', [{ name: 'generate_audio' }]),
      ],
    });

    render(
      <Step3GenerationModal
        isBusy={false}
        error={null}
        onClose={vi.fn()}
        onSkip={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    await waitFor(() => expect(screen.queryByTestId('step3-generate-audio-checkbox')).toBeNull());
    fireEvent.change(screen.getByTestId('step3-video-model-select'), { target: { value: 'fal-ai/audio' } });
    fireEvent.click(screen.getByTestId('step3-generate-audio-checkbox'));
    fireEvent.click(screen.getByTestId('step3-start-videos-button'));

    expect(onGenerate).toHaveBeenCalledWith({ modelId: 'fal-ai/audio', generateAudio: true });
  });
});
