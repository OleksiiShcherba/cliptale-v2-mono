import { describe, expect, it } from 'vitest';

import { openApiSpec } from './openapi.js';

type Operation = Record<string, unknown>;
type Paths = Record<string, Record<string, unknown>>;

const paths = openApiSpec.paths as unknown as Paths;

function responseSchema(op: Operation, status: number): Record<string, unknown> {
  const responses = op.responses as Record<number, Record<string, unknown>>;
  const response = responses[status] as Record<string, unknown>;
  return (
    (response.content as Record<string, Record<string, unknown>>)['application/json']
      .schema as Record<string, unknown>
  );
}

describe('openApiSpec storyboard music paths', () => {
  it('defines GET /storyboards/{draftId}/music', () => {
    const op = paths['/storyboards/{draftId}/music']?.get as Operation;

    expect(op.operationId).toBe('listStoryboardMusic');
    expect(op.tags).toContain('storyboard');
    expect(op.security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    expect(responseSchema(op, 200).$ref).toBe('#/components/schemas/StoryboardMusicResponse');
  });

  it('defines PUT/PATCH /storyboards/{draftId}/music/{musicBlockId}', () => {
    const path = paths['/storyboards/{draftId}/music/{musicBlockId}'];
    const put = path?.put as Operation;
    const patch = path?.patch as Operation;

    for (const op of [put, patch]) {
      const params = op.parameters as Array<Record<string, unknown>>;
      const requestBody = op.requestBody as Record<string, unknown>;
      const bodySchema = (
        ((requestBody.content as Record<string, unknown>)['application/json'] as Record<string, unknown>)
          .schema as Record<string, unknown>
      );

      expect(params.find((param) => param.name === 'draftId')).toBeDefined();
      expect(params.find((param) => param.name === 'musicBlockId')).toBeDefined();
      expect(bodySchema.$ref).toBe('#/components/schemas/StoryboardMusicBlockUpdateBody');
      expect(responseSchema(op, 200).$ref).toBe('#/components/schemas/StoryboardMusicBlock');
    }
    expect(put.operationId).toBe('updateStoryboardMusicBlock');
    expect(patch.operationId).toBe('patchStoryboardMusicBlock');
  });

  it('defines individual and pending music generation endpoints', () => {
    const generate = paths['/storyboards/{draftId}/music/{musicBlockId}/generate']?.post as Operation;
    const pending = paths['/storyboards/{draftId}/music/generate-pending']?.post as Operation;

    expect(generate.operationId).toBe('generateStoryboardMusicBlock');
    expect(generate.description).toContain('generate_now');
    expect(responseSchema(generate, 202).$ref).toBe('#/components/schemas/StoryboardMusicResponse');
    expect(pending.operationId).toBe('generatePendingStoryboardMusic');
    expect(pending.description).toContain('generate_on_step3');
    expect(responseSchema(pending, 202).$ref).toBe('#/components/schemas/StoryboardMusicResponse');
  });

  it('defines storyboard music response and update schemas', () => {
    const schemas = openApiSpec.components.schemas as Record<string, Record<string, unknown>>;

    expect(schemas.StoryboardMusicResponse.required).toEqual(['items']);
    expect(schemas.StoryboardMusicBlockUpdateBody.additionalProperties).toBe(false);
    expect((schemas.StoryboardMusicBlockUpdateBody.properties as Record<string, unknown>).volume)
      .toBeDefined();
  });
});
