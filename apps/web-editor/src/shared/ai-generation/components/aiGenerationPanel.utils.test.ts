import { describe, it, expect } from 'vitest';
import type { AiModel, FalModel, FalInputSchema } from '@/shared/ai-generation/types';
import {
  getFirstCapabilityForGroup,
  seedDefaults,
  isCatalogEmpty,
  hasAllRequired,
} from './aiGenerationPanel.utils';

describe('aiGenerationPanel.utils', () => {
  describe('getFirstCapabilityForGroup', () => {
    it('returns text_to_image for the images group', () => {
      expect(getFirstCapabilityForGroup('images')).toBe('text_to_image');
    });

    it('returns text_to_video for the videos group', () => {
      expect(getFirstCapabilityForGroup('videos')).toBe('text_to_video');
    });

    it('returns text_to_speech for the audio group', () => {
      expect(getFirstCapabilityForGroup('audio')).toBe('text_to_speech');
    });
  });

  describe('seedDefaults', () => {
    it('returns an empty object when no fields have defaults', () => {
      const schema: FalInputSchema = {
        fields: [
          { name: 'prompt', type: 'text', label: 'Prompt', required: true },
        ],
      };
      expect(seedDefaults(schema)).toEqual({});
    });

    it('seeds default values from schema fields', () => {
      const schema: FalInputSchema = {
        fields: [
          { name: 'prompt', type: 'text', label: 'Prompt', required: true },
          { name: 'num_images', type: 'number', label: 'Count', required: false, default: 3 },
          { name: 'ratio', type: 'text', label: 'Ratio', required: false, default: '1:1' },
        ],
      };
      expect(seedDefaults(schema)).toEqual({
        num_images: 3,
        ratio: '1:1',
      });
    });

    it('ignores undefined defaults even if present', () => {
      const schema: FalInputSchema = {
        fields: [
          { name: 'prompt', type: 'text', label: 'Prompt', required: true },
          { name: 'optional_field', type: 'text', label: 'Optional', required: false },
        ],
      };
      expect(seedDefaults(schema)).toEqual({});
    });

    it('preserves falsy defaults like 0, false, and empty string', () => {
      const schema: FalInputSchema = {
        fields: [
          { name: 'count', type: 'number', label: 'Count', required: false, default: 0 },
          { name: 'enabled', type: 'text', label: 'Enabled', required: false, default: false },
          { name: 'text', type: 'text', label: 'Text', required: false, default: '' },
        ],
      };
      expect(seedDefaults(schema)).toEqual({
        count: 0,
        enabled: false,
        text: '',
      });
    });
  });

  describe('isCatalogEmpty', () => {
    it('returns true when all capability lists are empty', () => {
      const catalog = {
        text_to_image: [],
        image_edit: [],
        text_to_video: [],
        image_to_video: [],
        text_to_speech: [],
        voice_cloning: [],
        speech_to_speech: [],
        music_generation: [],
      };
      expect(isCatalogEmpty(catalog)).toBe(true);
    });

    it('returns false when at least one capability has models', () => {
      const catalog = {
        text_to_image: [{ id: 'model-1' } as AiModel],
        image_edit: [],
        text_to_video: [],
        image_to_video: [],
        text_to_speech: [],
        voice_cloning: [],
        speech_to_speech: [],
        music_generation: [],
      };
      expect(isCatalogEmpty(catalog)).toBe(false);
    });

    it('returns false when an audio capability has models', () => {
      const catalog = {
        text_to_image: [],
        image_edit: [],
        text_to_video: [],
        image_to_video: [],
        text_to_speech: [{ id: 'elevenlabs/text-to-speech' } as AiModel],
        voice_cloning: [],
        speech_to_speech: [],
        music_generation: [],
      };
      expect(isCatalogEmpty(catalog)).toBe(false);
    });

    it('returns true for a catalog with one empty list', () => {
      const catalog = {
        text_to_image: [],
      };
      expect(isCatalogEmpty(catalog)).toBe(true);
    });
  });

  describe('hasAllRequired', () => {
    const createModel = (fields: any[]): FalModel => ({
      id: 'test-model',
      provider: 'fal',
      capability: 'text_to_image',
      group: 'images',
      label: 'Test Model',
      description: 'Test',
      inputSchema: { fields },
    });

    it('returns true when all required fields have non-empty values', () => {
      const model = createModel([
        { name: 'prompt', type: 'text', label: 'Prompt', required: true },
        { name: 'count', type: 'number', label: 'Count', required: false },
      ]);
      const values = { prompt: 'hello', count: 2 };
      expect(hasAllRequired(model, values)).toBe(true);
    });

    it('returns false when a required field is missing', () => {
      const model = createModel([
        { name: 'prompt', type: 'text', label: 'Prompt', required: true },
        { name: 'image', type: 'image_url', label: 'Image', required: true },
      ]);
      const values = { prompt: 'hello' };
      expect(hasAllRequired(model, values)).toBe(false);
    });

    it('returns false when a required field is an empty string', () => {
      const model = createModel([
        { name: 'prompt', type: 'text', label: 'Prompt', required: true },
      ]);
      const values = { prompt: '' };
      expect(hasAllRequired(model, values)).toBe(false);
    });

    it('returns false when a required field is undefined', () => {
      const model = createModel([
        { name: 'prompt', type: 'text', label: 'Prompt', required: true },
      ]);
      const values = { prompt: undefined };
      expect(hasAllRequired(model, values)).toBe(false);
    });

    it('returns false when a required array field is empty', () => {
      const model = createModel([
        { name: 'images', type: 'text', label: 'Images', required: true },
      ]);
      const values = { images: [] };
      expect(hasAllRequired(model, values)).toBe(false);
    });

    it('returns true when a required array field has items', () => {
      const model = createModel([
        { name: 'images', type: 'text', label: 'Images', required: true },
      ]);
      const values = { images: ['item1'] };
      expect(hasAllRequired(model, values)).toBe(true);
    });

    it('ignores optional fields that are missing', () => {
      const model = createModel([
        { name: 'prompt', type: 'text', label: 'Prompt', required: true },
        { name: 'optional', type: 'text', label: 'Optional', required: false },
      ]);
      const values = { prompt: 'hello' };
      expect(hasAllRequired(model, values)).toBe(true);
    });

    it('returns true when a model has no required fields', () => {
      const model = createModel([
        { name: 'optional1', type: 'text', label: 'Optional 1', required: false },
        { name: 'optional2', type: 'text', label: 'Optional 2', required: false },
      ]);
      const values = {};
      expect(hasAllRequired(model, values)).toBe(true);
    });

    it('returns true when a required field has the number 0 (falsy but valid)', () => {
      const model = createModel([
        { name: 'count', type: 'number', label: 'Count', required: true },
      ]);
      const values = { count: 0 };
      expect(hasAllRequired(model, values)).toBe(true);
    });

    it('returns true when a required field has false (falsy but valid for bool)', () => {
      const model = createModel([
        { name: 'enabled', type: 'text', label: 'Enabled', required: true },
      ]);
      const values = { enabled: false };
      expect(hasAllRequired(model, values)).toBe(true);
    });
  });
});
