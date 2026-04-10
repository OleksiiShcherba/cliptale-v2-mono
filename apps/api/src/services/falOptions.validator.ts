/**
 * Field-level validator for fal.ai model input schemas.
 *
 * Walks the declared `FalInputSchema.fields` list and enforces:
 *  - no unknown keys present in the options bag
 *  - every `required: true` field is present
 *  - typeof matches the declared field type
 *  - `enum` fields match one of the allowed values
 *  - `number` fields fall within the declared `min`/`max` (if set)
 *
 * Does NOT inject defaults — unset optional fields stay unset so fal.ai
 * applies its own server-side defaults. Does NOT perform asset-id resolution;
 * that lives in EPIC 9 Ticket 6 and treats values as opaque strings here.
 */
import type { FalFieldSchema, FalInputSchema } from '@ai-video-editor/api-contracts';

export type FalOptionsValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

/** Minimal model shape required by the validator — satisfied by both FalModel and ElevenLabsModel. */
type ModelWithSchema = { id: string; inputSchema: FalInputSchema };

/** Validates a plain options object against any AI model's input schema. */
export function validateFalOptions(
  model: ModelWithSchema,
  options: Record<string, unknown>,
): FalOptionsValidationResult {
  const errors: string[] = [];
  const fieldMap = new Map<string, FalFieldSchema>();
  for (const field of model.inputSchema.fields) {
    fieldMap.set(field.name, field);
  }

  for (const key of Object.keys(options)) {
    if (!fieldMap.has(key)) {
      errors.push(`Unknown field '${key}' for model '${model.id}'`);
    }
  }

  for (const field of model.inputSchema.fields) {
    const value = options[field.name];
    const present = value !== undefined;
    if (field.required && !present) {
      errors.push(`Field '${field.name}' is required`);
      continue;
    }
    if (!present) continue;
    checkField(field, value, errors);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function checkField(
  field: FalFieldSchema,
  value: unknown,
  errors: string[],
): void {
  switch (field.type) {
    case 'string':
    case 'text': {
      if (typeof value !== 'string') {
        errors.push(`Field '${field.name}' must be a string`);
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`Field '${field.name}' must be a number`);
        return;
      }
      if (field.min !== undefined && value < field.min) {
        errors.push(`Field '${field.name}' must be >= ${field.min}`);
      }
      if (field.max !== undefined && value > field.max) {
        errors.push(`Field '${field.name}' must be <= ${field.max}`);
      }
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push(`Field '${field.name}' must be a boolean`);
      }
      return;
    }
    case 'enum': {
      const allowed = field.enum ?? [];
      if (typeof value !== 'string' || !allowed.includes(value)) {
        errors.push(
          `Field '${field.name}' must be one of: ${allowed.join(', ')}`,
        );
      }
      return;
    }
    case 'image_url': {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`Field '${field.name}' must be a non-empty string`);
      }
      return;
    }
    case 'image_url_list': {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((v) => typeof v === 'string' && v.length > 0)
      ) {
        errors.push(
          `Field '${field.name}' must be a non-empty array of strings`,
        );
      }
      return;
    }
    case 'string_list': {
      if (
        !Array.isArray(value) ||
        !value.every((v) => typeof v === 'string')
      ) {
        errors.push(`Field '${field.name}' must be an array of strings`);
      }
      return;
    }
    case 'audio_url': {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`Field '${field.name}' must be a non-empty string`);
      }
      return;
    }
    case 'audio_upload': {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`Field '${field.name}' must be a non-empty string (upload URL)`);
      }
      return;
    }
  }
}
