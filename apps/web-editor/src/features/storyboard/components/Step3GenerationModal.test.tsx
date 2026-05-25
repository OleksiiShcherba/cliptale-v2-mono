import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiModel } from '@/shared/ai-generation/types';

const { mockListModels } = vi.hoisted(() => ({
  mockListModels: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  listModels: mockListModels,
}));

import { getModelDurationBehavior, Step3GenerationModal } from './Step3GenerationModal';

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
    expect(screen.getByTestId('step3-duration-behavior').textContent).toBe(
      'No recognized duration control; provider default duration may apply.',
    );
    fireEvent.change(screen.getByTestId('step3-video-model-select'), { target: { value: 'fal-ai/second' } });
    fireEvent.click(screen.getByTestId('step3-start-videos-button'));

    expect(onGenerate).toHaveBeenCalledWith({ modelId: 'fal-ai/second', generateAudio: false });
  });

  it('describes direct duration and frame-count duration behavior', async () => {
    mockListModels.mockResolvedValue({
      image_to_video: [
        makeModel('fal-ai/direct', [{ name: 'duration' }]),
        makeModel('fal-ai/ltx-2-19b/image-to-video', [{ name: 'num_frames' }, { name: 'fps' }]),
      ],
    });

    render(
      <Step3GenerationModal
        isBusy={false}
        error={null}
        onClose={vi.fn()}
        onSkip={vi.fn()}
        onGenerate={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByDisplayValue('fal-ai/direct')).toBeTruthy());
    expect(screen.getByTestId('step3-duration-behavior').textContent).toBe('Uses each scene duration directly.');

    fireEvent.change(screen.getByTestId('step3-video-model-select'), {
      target: { value: 'fal-ai/ltx-2-19b/image-to-video' },
    });
    expect(screen.getByTestId('step3-duration-behavior').textContent).toBe(
      'Uses each scene duration by converting it to generated frames.',
    );
  });

  it('keeps generation enabled when the model has no recognized duration control', async () => {
    const onGenerate = vi.fn();
    const model = makeModel('fal-ai/provider-default');
    mockListModels.mockResolvedValue({ image_to_video: [model] });

    render(
      <Step3GenerationModal
        isBusy={false}
        error={null}
        onClose={vi.fn()}
        onSkip={vi.fn()}
        onGenerate={onGenerate}
      />,
    );

    await waitFor(() => expect(screen.getByDisplayValue('fal-ai/provider-default')).toBeTruthy());
    expect(getModelDurationBehavior(model)).toEqual({
      copy: 'No recognized duration control; provider default duration may apply.',
      tone: 'warning',
    });

    fireEvent.click(screen.getByTestId('step3-start-videos-button'));
    expect(onGenerate).toHaveBeenCalledWith({ modelId: 'fal-ai/provider-default', generateAudio: false });
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
