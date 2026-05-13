import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

const schemas = (openApiSpec.components as { schemas: Record<string, unknown> }).schemas;

describe('openApiSpec generation draft schemas', () => {
  it('uses PromptDoc for GenerationDraft responses and upsert bodies', () => {
    const generationDraft = schemas['GenerationDraft'] as Record<string, unknown>;
    const generationDraftProps = generationDraft.properties as Record<string, Record<string, unknown>>;
    expect(generationDraftProps.promptDoc?.$ref).toBe('#/components/schemas/PromptDoc');

    const upsertBody = schemas['UpsertGenerationDraftBody'] as Record<string, unknown>;
    const upsertProps = upsertBody.properties as Record<string, Record<string, unknown>>;
    expect(upsertProps.promptDoc?.$ref).toBe('#/components/schemas/PromptDoc');
  });

  it('documents PromptDoc settings as optional root data', () => {
    const promptDoc = schemas['PromptDoc'] as Record<string, unknown>;
    const required = promptDoc.required as string[];
    const props = promptDoc.properties as Record<string, Record<string, unknown>>;

    expect(required).toEqual(expect.arrayContaining(['schemaVersion', 'blocks']));
    expect(required).not.toContain('settings');
    expect(props.schemaVersion?.enum).toEqual([1]);
    expect(props.blocks?.type).toBe('array');
    expect(props.settings?.$ref).toBe('#/components/schemas/DraftSettings');
  });

  it('documents draft settings values', () => {
    const draftSettings = schemas['DraftSettings'] as Record<string, unknown>;
    const required = draftSettings.required as string[];
    const props = draftSettings.properties as Record<string, Record<string, unknown>>;

    expect(required).toEqual(expect.arrayContaining(['videoLengthSeconds', 'aspectRatio', 'styleKey']));
    expect(required).not.toContain('modelPreference');
    expect(props.videoLengthSeconds?.type).toBe('integer');
    expect(props.videoLengthSeconds?.minimum).toBe(1);
    expect(props.videoLengthSeconds?.maximum).toBe(600);
    expect(props.aspectRatio?.enum).toEqual(['16:9', '9:16', '1:1']);
    expect(props.styleKey?.enum).toEqual([
      'cinematic',
      'documentary',
      'social',
      'product',
      'minimal',
    ]);
    expect(props.modelPreference?.type).toEqual(['string', 'null']);
  });
});
