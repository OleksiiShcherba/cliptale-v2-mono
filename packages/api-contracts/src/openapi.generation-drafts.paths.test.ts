import { describe, expect, it } from 'vitest';

import { openApiSpec } from './openapi.js';

type Operation = Record<string, unknown>;
type Paths = Record<string, Record<string, Operation>>;

const paths = openApiSpec.paths as unknown as Paths;

describe('openApiSpec generation draft storyboard-plan paths', () => {
  it('documents POST /generation-drafts/{id}/storyboard-plan as a 202 async enqueue', () => {
    const op = paths['/generation-drafts/{id}/storyboard-plan']?.post;

    expect(op).toBeDefined();
    expect(op.operationId).toBe('startStoryboardPlan');
    expect(op.tags).toContain('generation-drafts');
    expect(op.security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));

    const params = op.parameters as Array<Record<string, unknown>>;
    expect(params.find((p) => p.name === 'id')).toMatchObject({
      in: 'path',
      required: true,
    });

    const responses = op.responses as Record<number, Record<string, unknown>>;
    const accepted = responses[202];
    const schema = (
      (accepted.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
    ).schema as Record<string, unknown>;
    expect(schema.$ref).toBe('#/components/schemas/StartStoryboardPlanResponse');
    expect(responses[403]).toBeDefined();
    expect(responses[404]).toBeDefined();
    expect(responses[422]).toBeDefined();
  });

  it('documents GET /generation-drafts/{id}/storyboard-plan/{jobId}', () => {
    const op = paths['/generation-drafts/{id}/storyboard-plan/{jobId}']?.get;

    expect(op).toBeDefined();
    expect(op.operationId).toBe('getStoryboardPlanStatus');
    expect(op.tags).toContain('generation-drafts');
    expect(op.security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));

    const params = op.parameters as Array<Record<string, unknown>>;
    expect(params.map((p) => p.name)).toEqual(['id', 'jobId']);

    const responses = op.responses as Record<number, Record<string, unknown>>;
    const ok = responses[200];
    const schema = (
      (ok.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
    ).schema as Record<string, unknown>;
    expect(schema.$ref).toBe('#/components/schemas/StoryboardPlanJobStatusResponse');
    expect(responses[403]).toBeDefined();
    expect(responses[404]).toBeDefined();
  });
});
