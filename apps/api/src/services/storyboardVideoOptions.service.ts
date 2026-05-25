import type { AiModel, FalFieldSchema } from '@ai-video-editor/api-contracts';

import { UnprocessableEntityError, ValidationError } from '@/lib/errors.js';
import type { StoryboardBlock } from '@/repositories/storyboard.repository.js';

function findField(model: AiModel, name: string): FalFieldSchema | undefined {
  return model.inputSchema.fields.find((field) => field.name === name);
}

/** Returns whether an Image-to-Video model exposes a supported audio toggle. */
export function modelSupportsAudio(model: AiModel): boolean {
  return Boolean(findField(model, 'generate_audio') ?? findField(model, 'generate_audio_switch'));
}

function getAudioFieldName(model: AiModel): 'generate_audio' | 'generate_audio_switch' | null {
  if (findField(model, 'generate_audio')) return 'generate_audio';
  if (findField(model, 'generate_audio_switch')) return 'generate_audio_switch';
  return null;
}

function chooseDurationEnumValue(field: FalFieldSchema, durationS: number): string | undefined {
  const numericValues = (field.enum ?? [])
    .map((value) => ({ raw: value, numeric: Number(value) }))
    .filter((value) => Number.isFinite(value.numeric));
  if (!numericValues.length) {
    return undefined;
  }
  const target = Math.round(durationS);
  numericValues.sort((a, b) => Math.abs(a.numeric - target) - Math.abs(b.numeric - target));
  return numericValues[0]!.raw;
}

function chooseDurationNumberValue(field: FalFieldSchema, durationS: number): number {
  const rounded = Math.max(1, Math.round(durationS));
  return clampNumericFieldValue(field, rounded);
}

function clampNumericFieldValue(field: FalFieldSchema, value: number): number {
  const min = field.min ?? value;
  const max = field.max ?? value;
  return Math.min(max, Math.max(min, value));
}

function getDefaultNumberValue(field: FalFieldSchema): number | undefined {
  return typeof field.default === 'number' && Number.isFinite(field.default)
    ? field.default
    : undefined;
}

function setFrameDurationOption(
  model: AiModel,
  options: Record<string, unknown>,
  durationS: number,
  frameRateFieldName: 'fps' | 'frames_per_second',
): boolean {
  const numFramesField = findField(model, 'num_frames');
  const frameRateField = findField(model, frameRateFieldName);
  if (
    !numFramesField ||
    !frameRateField ||
    numFramesField.type !== 'number' ||
    frameRateField.type !== 'number'
  ) {
    return false;
  }

  const defaultFrameRate = getDefaultNumberValue(frameRateField);
  if (defaultFrameRate === undefined) {
    return false;
  }

  const frameRate = clampNumericFieldValue(frameRateField, defaultFrameRate);
  options[frameRateFieldName] = frameRate;
  options['num_frames'] = clampNumericFieldValue(
    numFramesField,
    Math.round(durationS * frameRate),
  );
  return true;
}

function setDurationOption(model: AiModel, options: Record<string, unknown>, durationS: number): void {
  const field = findField(model, 'duration');
  if (field?.type === 'enum') {
    const value = chooseDurationEnumValue(field, durationS);
    if (value !== undefined) options['duration'] = value;
    return;
  }
  if (field?.type === 'number') {
    options['duration'] = chooseDurationNumberValue(field, durationS);
    return;
  }
  if (field) return;

  if (setFrameDurationOption(model, options, durationS, 'fps')) return;
  setFrameDurationOption(model, options, durationS, 'frames_per_second');
}

/** Builds provider options for storyboard Image-to-Video generation. */
export function buildStoryboardVideoOptions(params: {
  model: AiModel;
  block: StoryboardBlock;
  imageFileId: string;
  nextImageFileId?: string | null;
  generateAudio: boolean;
}): Record<string, unknown> {
  const prompt = params.block.videoPrompt?.trim();
  if (!prompt) {
    throw new UnprocessableEntityError(`Scene block ${params.block.id} has no video prompt`);
  }

  const options: Record<string, unknown> = {
    prompt,
    image_url: params.imageFileId,
  };

  if (params.nextImageFileId && findField(params.model, 'end_image_url')) {
    options['end_image_url'] = params.nextImageFileId;
  }

  setDurationOption(params.model, options, params.block.durationS);

  const audioField = getAudioFieldName(params.model);
  if (params.generateAudio && !audioField) {
    throw new ValidationError(`Model '${params.model.id}' does not support audio generation`);
  }
  if (audioField) {
    options[audioField] = params.generateAudio;
  }

  return options;
}
