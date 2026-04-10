import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AiModel, ElevenLabsModel, FalModel, ListModelsResponse } from '@/features/ai-generation/types';

/**
 * Shared fixtures for the split `AiGenerationPanel.*.test.tsx` files.
 *
 * Kept as a non-`.test` file so Vitest does not try to execute it as a suite.
 * Imported by `AiGenerationPanel.test.tsx`, `AiGenerationPanel.form.test.tsx`,
 * and `AiGenerationPanel.states.test.tsx`.
 */

/** Fixture model covering the `text_to_image` capability with a prompt + numeric field. */
export const NANO_BANANA: FalModel = {
  id: 'fal-ai/nano-banana-2',
  provider: 'fal',
  capability: 'text_to_image',
  group: 'images',
  label: 'Nano Banana 2',
  description: 'Fast text-to-image model',
  inputSchema: {
    fields: [
      {
        name: 'prompt',
        type: 'text',
        label: 'Prompt',
        required: true,
      },
      {
        name: 'num_images',
        type: 'number',
        label: 'Number of Images',
        required: false,
        default: 1,
        min: 1,
        max: 4,
      },
    ],
  },
};

/** Fixture model covering the `image_edit` capability with an asset-picker field. */
export const SEEDREAM_EDIT: FalModel = {
  id: 'fal-ai/seedream-4-edit',
  provider: 'fal',
  capability: 'image_edit',
  group: 'images',
  label: 'Seedream 4 Edit',
  description: 'Image editing model',
  inputSchema: {
    fields: [
      { name: 'prompt', type: 'text', label: 'Prompt', required: true },
      { name: 'image_url', type: 'image_url', label: 'Source Image', required: true },
    ],
  },
};

/** Fixture model covering the `text_to_video` capability with a single prompt field. */
export const KLING_VIDEO: FalModel = {
  id: 'fal-ai/kling-video/v2.5/pro',
  provider: 'fal',
  capability: 'text_to_video',
  group: 'videos',
  label: 'Kling 2.5 Pro',
  description: 'Text-to-video model',
  inputSchema: {
    fields: [{ name: 'prompt', type: 'text', label: 'Prompt', required: true }],
  },
};

/** Fixture ElevenLabs model for the `text_to_speech` capability. */
export const TTS_MODEL: ElevenLabsModel = {
  id: 'elevenlabs/text-to-speech',
  provider: 'elevenlabs',
  capability: 'text_to_speech',
  group: 'audio',
  label: 'Text to Speech',
  description: 'Convert text to natural-sounding speech.',
  inputSchema: {
    fields: [{ name: 'text', type: 'text', label: 'Text', required: true }],
  },
};

/** Empty `ListModelsResponse` — used to drive the panel's empty-catalog state. */
export const EMPTY_CATALOG: ListModelsResponse = {
  text_to_image: [],
  image_edit: [],
  text_to_video: [],
  image_to_video: [],
  text_to_speech: [],
  voice_cloning: [],
  speech_to_speech: [],
  music_generation: [],
};

/** Populated `ListModelsResponse` — one model per capability except some. */
export const FULL_CATALOG: ListModelsResponse = {
  text_to_image: [NANO_BANANA],
  image_edit: [SEEDREAM_EDIT],
  text_to_video: [KLING_VIDEO],
  image_to_video: [],
  text_to_speech: [TTS_MODEL],
  voice_cloning: [],
  speech_to_speech: [],
  music_generation: [],
};

/**
 * Default idle return value for the mocked `useAiGeneration` hook. Tests
 * override individual fields (e.g. `isGenerating`, `currentJob`) via spread.
 */
export function defaultHookReturn() {
  return {
    submit: vi.fn(),
    currentJob: null,
    isGenerating: false,
    error: null,
    reset: vi.fn(),
  };
}

/**
 * Renders `ui` inside a fresh `QueryClientProvider`. React Query is required
 * because the panel (and `AssetPickerField`) call `useQuery` internally.
 */
export function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
