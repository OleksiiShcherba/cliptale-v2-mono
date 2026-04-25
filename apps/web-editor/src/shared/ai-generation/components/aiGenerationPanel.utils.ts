import type { AiCapability, AiGroup, AiModel, FalInputSchema } from '@/shared/ai-generation/types';

/** Capabilities ordered as they appear in the sub-tab row, per group. */
const GROUP_DEFAULT_CAPABILITY: Readonly<Record<AiGroup, AiCapability>> = {
  images: 'text_to_image',
  videos: 'text_to_video',
  audio: 'text_to_speech',
};

/** Returns the first (default) sub-capability for a group. */
export function getFirstCapabilityForGroup(group: AiGroup): AiCapability {
  return GROUP_DEFAULT_CAPABILITY[group];
}

/** Seeds an option-values map from each field's declared default. */
export function seedDefaults(schema: FalInputSchema): Record<string, unknown> {
  const seeded: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.default !== undefined) {
      seeded[field.name] = field.default;
    }
  }
  return seeded;
}

/** Returns true when every capability list in the catalog is empty. */
export function isCatalogEmpty(catalog: Record<AiCapability, AiModel[]>): boolean {
  return Object.values(catalog).every((list) => list.length === 0);
}

/** Returns true when every required field in the model's schema has a value. */
export function hasAllRequired(model: AiModel, values: Record<string, unknown>): boolean {
  for (const field of model.inputSchema.fields) {
    if (!field.required) continue;
    const value = values[field.name];
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return false;
    }
  }
  return true;
}

/**
 * Extract the top-level `prompt` from option values when the model's schema
 * declares a `prompt` field. The BE's `aiGeneration.service.ts` merges the
 * top-level prompt into `options.prompt` automatically, so the FE MUST NOT
 * duplicate it into `options`.
 */
export function splitPromptFromOptions(
  model: AiModel,
  values: Record<string, unknown>,
): { prompt: string | undefined; options: Record<string, unknown> } {
  const hasPromptField = model.inputSchema.fields.some((field) => field.name === 'prompt');
  if (!hasPromptField) {
    return { prompt: undefined, options: values };
  }
  const { prompt, ...rest } = values;
  return {
    prompt: typeof prompt === 'string' && prompt.length > 0 ? prompt : undefined,
    options: rest,
  };
}
