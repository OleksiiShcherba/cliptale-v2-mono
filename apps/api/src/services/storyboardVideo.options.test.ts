import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors.js';
import { validateFalOptions } from '@/services/falOptions.validator.js';
import {
  getModel,
  KLING_MODEL_ID,
  LTX_MODEL_ID,
  makeBlock,
  PIXVERSE_MODEL_ID,
  WAN_MODEL_ID,
} from '@/services/storyboardVideo.fixtures.js';
import {
  buildStoryboardVideoOptions,
  modelSupportsAudio,
} from '@/services/storyboardVideoOptions.service.js';

describe('storyboardVideo options durationS mapping by model schema', () => {
  it('converts durationS to fps and num_frames for LTX-2 because it has no duration field', () => {
    const model = getModel(LTX_MODEL_ID);
    const block = makeBlock({ durationS: 6 });

    const options = buildStoryboardVideoOptions({
      model,
      block,
      imageFileId: 'image-file-1',
      nextImageFileId: 'image-file-2',
      generateAudio: true,
    });

    expect(options).toMatchObject({
      prompt: 'Push in while the subject turns toward camera.',
      image_url: 'image-file-1',
      end_image_url: 'image-file-2',
      generate_audio: true,
      fps: 25,
      num_frames: 150,
    });
    expect(options).not.toHaveProperty('duration');
    expect(validateFalOptions(model, options).ok).toBe(true);
    expect(modelSupportsAudio(model)).toBe(true);
  });

  it('keeps durationS on the duration field when the selected model exposes duration', () => {
    const model = getModel(KLING_MODEL_ID);

    const options = buildStoryboardVideoOptions({
      model,
      block: makeBlock({ durationS: 7 }),
      imageFileId: 'image-file-1',
      generateAudio: false,
    });

    expect(options).toMatchObject({
      duration: '7',
      generate_audio: false,
    });
    expect(options).not.toHaveProperty('num_frames');
    expect(options).not.toHaveProperty('fps');
    expect(options).not.toHaveProperty('frames_per_second');
    expect(validateFalOptions(model, options).ok).toBe(true);
  });

  it('clamps durationS for PixVerse numeric duration instead of setting frame fields', () => {
    const model = getModel(PIXVERSE_MODEL_ID);

    const options = buildStoryboardVideoOptions({
      model,
      block: makeBlock({ durationS: 30 }),
      imageFileId: 'image-file-1',
      generateAudio: true,
    });

    expect(options).toMatchObject({
      duration: 15,
      generate_audio_switch: true,
    });
    expect(options).not.toHaveProperty('num_frames');
    expect(options).not.toHaveProperty('fps');
    expect(options).not.toHaveProperty('frames_per_second');
    expect(validateFalOptions(model, options).ok).toBe(true);
  });

  it('converts durationS through frames_per_second and clamps num_frames when no duration field exists', () => {
    const model = getModel(WAN_MODEL_ID);

    const options = buildStoryboardVideoOptions({
      model,
      block: makeBlock({ durationS: 20 }),
      imageFileId: 'image-file-1',
      generateAudio: false,
    });

    expect(options).toMatchObject({
      frames_per_second: 16,
      num_frames: 161,
    });
    expect(options).not.toHaveProperty('duration');
    expect(options).not.toHaveProperty('fps');
    expect(validateFalOptions(model, options).ok).toBe(true);
  });

  it('rejects audio when the selected model does not support it', () => {
    expect(() => buildStoryboardVideoOptions({
      model: getModel(WAN_MODEL_ID),
      block: makeBlock(),
      imageFileId: 'image-file-1',
      generateAudio: true,
    })).toThrow(ValidationError);
  });
});
