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
    case 'composition_plan': {
      validateCompositionPlan(field.name, value, errors);
      return;
    }
  }
}

function validateCompositionPlan(
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`Field '${fieldName}' must be a composition plan object`);
    return;
  }

  const plan = value as Record<string, unknown>;
  validateStringArray(fieldName, 'positive_global_styles', plan['positive_global_styles'], errors, 50);
  validateStringArray(fieldName, 'negative_global_styles', plan['negative_global_styles'], errors, 50);

  const sections = plan['sections'];
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 30) {
    errors.push(`Field '${fieldName}.sections' must contain 1-30 sections`);
    return;
  }

  let totalDurationMs = 0;
  for (const [index, rawSection] of sections.entries()) {
    const sectionPath = `${fieldName}.sections[${index}]`;
    if (rawSection === null || typeof rawSection !== 'object' || Array.isArray(rawSection)) {
      errors.push(`Field '${sectionPath}' must be an object`);
      continue;
    }

    const section = rawSection as Record<string, unknown>;
    if (typeof section['section_name'] !== 'string' || section['section_name'].length === 0) {
      errors.push(`Field '${sectionPath}.section_name' must be a non-empty string`);
    }
    validateStringArray(sectionPath, 'positive_local_styles', section['positive_local_styles'], errors, 50);
    validateStringArray(sectionPath, 'negative_local_styles', section['negative_local_styles'], errors, 50);
    validateStringArray(sectionPath, 'lines', section['lines'], errors, 30);

    const durationMs = section['duration_ms'];
    if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) {
      errors.push(`Field '${sectionPath}.duration_ms' must be a number`);
      continue;
    }
    if (durationMs < 3_000 || durationMs > 120_000) {
      errors.push(`Field '${sectionPath}.duration_ms' must be between 3000 and 120000`);
    }
    totalDurationMs += durationMs;
  }

  if (totalDurationMs < 3_000 || totalDurationMs > 600_000) {
    errors.push(`Field '${fieldName}' total duration must be between 3000 and 600000`);
  }
}

function validateStringArray(
  parentPath: string,
  key: string,
  value: unknown,
  errors: string[],
  maxItems: number,
): void {
  const path = `${parentPath}.${key}`;
  if (!Array.isArray(value) || value.length > maxItems) {
    errors.push(`Field '${path}' must be an array with at most ${maxItems} items`);
    return;
  }
  if (!value.every((item) => typeof item === 'string')) {
    errors.push(`Field '${path}' must contain only strings`);
  }
}
