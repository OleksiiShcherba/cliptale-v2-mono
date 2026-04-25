import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

// ── Helper types ─────────────────────────────────────────────────────────────

type PathItem = Record<string, unknown>;
type Paths = Record<string, PathItem>;

const paths = openApiSpec.paths as unknown as Paths;

// ── Storyboard path tests ────────────────────────────────────────────────────

describe('openApiSpec storyboard paths', () => {
  describe('POST /storyboards/{draftId}/initialize', () => {
    const op = paths['/storyboards/{draftId}/initialize']?.['post'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId initializeStoryboard', () => {
      expect(op.operationId).toBe('initializeStoryboard');
    });

    it('is tagged storyboard', () => {
      expect(op.tags).toContain('storyboard');
    });

    it('requires bearerAuth security', () => {
      const security = op.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('has a draftId path parameter', () => {
      const params = op.parameters as Array<Record<string, unknown>>;
      const draftId = params?.find((p) => p.name === 'draftId');
      expect(draftId).toBeDefined();
      expect(draftId?.in).toBe('path');
      expect(draftId?.required).toBe(true);
    });

    it('responds 200 with StoryboardState schema ref', () => {
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      expect(schema?.$ref).toBe('#/components/schemas/StoryboardState');
    });

    it('responds 401, 403, and 404', () => {
      const responses = op.responses as Record<string, unknown>;
      expect(responses[401]).toBeDefined();
      expect(responses[403]).toBeDefined();
      expect(responses[404]).toBeDefined();
    });
  });

  describe('GET /storyboards/{draftId}', () => {
    const op = paths['/storyboards/{draftId}']?.['get'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId getStoryboard', () => {
      expect(op.operationId).toBe('getStoryboard');
    });

    it('is tagged storyboard', () => {
      expect(op.tags).toContain('storyboard');
    });

    it('requires bearerAuth security', () => {
      const security = op.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('responds 200 with StoryboardState schema ref', () => {
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      expect(schema?.$ref).toBe('#/components/schemas/StoryboardState');
    });
  });

  describe('PUT /storyboards/{draftId}', () => {
    const op = paths['/storyboards/{draftId}']?.['put'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId putStoryboard', () => {
      expect(op.operationId).toBe('putStoryboard');
    });

    it('is tagged storyboard', () => {
      expect(op.tags).toContain('storyboard');
    });

    it('requires bearerAuth security', () => {
      const security = op.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('has a required requestBody with SaveStoryboardBody schema ref', () => {
      const requestBody = op.requestBody as Record<string, unknown>;
      expect(requestBody?.required).toBe(true);
      const schema = (
        (requestBody?.content as Record<string, unknown>)?.['application/json'] as Record<
          string,
          unknown
        >
      )?.schema as Record<string, unknown>;
      expect(schema?.$ref).toBe('#/components/schemas/SaveStoryboardBody');
    });

    it('responds 200 with StoryboardState schema ref', () => {
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      expect(schema?.$ref).toBe('#/components/schemas/StoryboardState');
    });

    it('responds 400 on validation error', () => {
      const responses = op.responses as Record<string, unknown>;
      expect(responses[400]).toBeDefined();
    });
  });

  describe('GET /storyboards/{draftId}/history', () => {
    const op = paths['/storyboards/{draftId}/history']?.['get'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId listStoryboardHistory', () => {
      expect(op.operationId).toBe('listStoryboardHistory');
    });

    it('is tagged storyboard', () => {
      expect(op.tags).toContain('storyboard');
    });

    it('requires bearerAuth security', () => {
      const security = op.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('responds 200 with an array of StoryboardHistoryEntry items', () => {
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      expect(schema?.type).toBe('array');
      const items = schema?.items as Record<string, unknown>;
      expect(items?.$ref).toBe('#/components/schemas/StoryboardHistoryEntry');
    });
  });

  describe('POST /storyboards/{draftId}/history', () => {
    const op = paths['/storyboards/{draftId}/history']?.['post'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId pushStoryboardHistory', () => {
      expect(op.operationId).toBe('pushStoryboardHistory');
    });

    it('is tagged storyboard', () => {
      expect(op.tags).toContain('storyboard');
    });

    it('requires bearerAuth security', () => {
      const security = op.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('has a required requestBody with PushHistoryBody schema ref', () => {
      const requestBody = op.requestBody as Record<string, unknown>;
      expect(requestBody?.required).toBe(true);
      const schema = (
        (requestBody?.content as Record<string, unknown>)?.['application/json'] as Record<
          string,
          unknown
        >
      )?.schema as Record<string, unknown>;
      expect(schema?.$ref).toBe('#/components/schemas/PushHistoryBody');
    });

    it('responds 201 with an id integer property', () => {
      const responses = op.responses as Record<string, unknown>;
      const created = responses[201] as Record<string, unknown>;
      const schema = (
        (created?.content as Record<string, unknown>)?.['application/json'] as Record<
          string,
          unknown
        >
      )?.schema as Record<string, unknown>;
      const props = schema?.properties as Record<string, Record<string, unknown>>;
      expect(props?.id?.type).toBe('integer');
    });

    it('responds 400 on validation error', () => {
      const responses = op.responses as Record<string, unknown>;
      expect(responses[400]).toBeDefined();
    });
  });
});
