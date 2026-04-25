/**
 * aiGenerationPanel.utils — splitPromptFromOptions tests.
 *
 * Other utility tests (getFirstCapabilityForGroup, seedDefaults, isCatalogEmpty,
 * hasAllRequired) live in aiGenerationPanel.utils.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { FalModel } from '@/shared/ai-generation/types';
import { splitPromptFromOptions } from './aiGenerationPanel.utils';

const createModel = (hasPromptField: boolean): FalModel => ({
  id: 'test-model',
  capability: 'text_to_image',
  group: 'images',
  label: 'Test Model',
  description: 'Test',
  inputSchema: {
    fields: hasPromptField
      ? [{ name: 'prompt', type: 'text', label: 'Prompt', required: true }]
      : [{ name: 'other', type: 'text', label: 'Other', required: false }],
  },
});

describe('splitPromptFromOptions', () => {
  it('extracts prompt when the model has a prompt field', () => {
    const model = createModel(true);
    const values = { prompt: 'A cat in space', other: 'value' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: 'A cat in space',
      options: { other: 'value' },
    });
  });

  it('returns undefined prompt when the prompt field is empty string', () => {
    const model = createModel(true);
    const values = { prompt: '', other: 'value' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: undefined,
      options: { other: 'value' },
    });
  });

  it('returns undefined prompt when the model has no prompt field', () => {
    const model = createModel(false);
    const values = { other: 'value' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: undefined,
      options: { other: 'value' },
    });
  });

  it('returns undefined prompt when prompt is not a string', () => {
    const model = createModel(true);
    const values = { prompt: 123, other: 'value' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: undefined,
      options: { other: 'value' },
    });
  });

  it('returns all values in options when model has no prompt field', () => {
    const model = createModel(false);
    const values = { num_images: 4, ratio: '1:1' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: undefined,
      options: { num_images: 4, ratio: '1:1' },
    });
  });

  it('handles models with only a prompt field', () => {
    const model = createModel(true);
    const values = { prompt: 'test prompt' };
    const result = splitPromptFromOptions(model, values);
    expect(result).toEqual({
      prompt: 'test prompt',
      options: {},
    });
  });

  it('removes prompt from options even if other fields use the same name', () => {
    const model = createModel(true);
    const values = { prompt: 'keep this', num_images: 2 };
    const result = splitPromptFromOptions(model, values);
    expect(result.options).not.toHaveProperty('prompt');
    expect(result.prompt).toBe('keep this');
  });
});
