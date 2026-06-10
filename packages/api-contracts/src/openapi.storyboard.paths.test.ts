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

  describe('POST /storyboards/{draftId}/apply-latest-plan', () => {
    const op = paths['/storyboards/{draftId}/apply-latest-plan']?.['post'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId applyLatestStoryboardPlan', () => {
      expect(op.operationId).toBe('applyLatestStoryboardPlan');
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

    it('responds 401, 403, 404, and 422', () => {
      const responses = op.responses as Record<string, unknown>;
      expect(responses[401]).toBeDefined();
      expect(responses[403]).toBeDefined();
      expect(responses[404]).toBeDefined();
      expect(responses[422]).toBeDefined();
    });
  });

  describe('POST /storyboards/{draftId}/project', () => {
    const op = paths['/storyboards/{draftId}/project']?.['post'] as Record<string, unknown>;

    it('exists in the spec', () => {
      expect(op).toBeDefined();
    });

    it('has operationId createProjectFromStoryboard', () => {
      expect(op.operationId).toBe('createProjectFromStoryboard');
    });

    it('is tagged storyboard and secured with bearerAuth', () => {
      expect(op.tags).toContain('storyboard');
      expect(op.security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    });

    it('documents idempotent project creation and response schema', () => {
      expect(op.description).toContain('idempotent');
      const requestBody = op.requestBody as Record<string, unknown>;
      const bodySchema = (
        ((requestBody.content as Record<string, unknown>)['application/json'] as Record<string, unknown>)
          .schema as Record<string, unknown>
      );
      expect(bodySchema.$ref).toBe('#/components/schemas/CreateStoryboardProjectBody');
      const responses = op.responses as Record<string, unknown>;
      const created = responses[201] as Record<string, unknown>;
      const schema = (
        (created.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardProjectCreateResponse');
      expect(responses[422]).toBeDefined();
    });
  });

  describe('storyboard illustration paths', () => {
    it('defines GET /storyboards/{draftId}/videos', () => {
      const op = paths['/storyboards/{draftId}/videos']?.['get'] as Record<string, unknown>;
      expect(op.operationId).toBe('listStoryboardVideos');
      expect(op.description).toContain('Image-to-Video generation status');
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardVideoStatusResponse');
    });

    it('defines POST /storyboards/{draftId}/videos', () => {
      const op = paths['/storyboards/{draftId}/videos']?.['post'] as Record<string, unknown>;
      expect(op.operationId).toBe('startStoryboardVideos');
      expect(op.description).toContain('scene videoPrompt');
      expect(op.requestBody).toBeDefined();
      const requestBody = op.requestBody as Record<string, unknown>;
      const bodySchema = (
        ((requestBody.content as Record<string, unknown>)['application/json'] as Record<string, unknown>)
          .schema as Record<string, unknown>
      );
      expect(bodySchema.$ref).toBe('#/components/schemas/StartStoryboardVideosBody');
      const responses = op.responses as Record<string, unknown>;
      const accepted = responses[202] as Record<string, unknown>;
      const schema = (
        (accepted.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardVideoStatusResponse');
      expect(responses[400]).toBeDefined();
      expect(responses[422]).toBeDefined();
    });

    it('defines GET /storyboards/{draftId}/illustrations', () => {
      const op = paths['/storyboards/{draftId}/illustrations']?.['get'] as Record<string, unknown>;
      expect(op.operationId).toBe('listStoryboardIllustrations');
      expect(op.description).toContain('canonical style reference status');
      const responses = op.responses as Record<string, unknown>;
      const ok = responses[200] as Record<string, unknown>;
      const schema = (
        (ok.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardIllustrationStatusResponse');
    });

    it('defines POST /storyboards/{draftId}/illustrations', () => {
      const op = paths['/storyboards/{draftId}/illustrations']?.['post'] as Record<string, unknown>;
      expect(op.operationId).toBe('startStoryboardIllustrations');
      expect(op.description).toContain('canonical style reference');
      expect(op.description).toContain('next eligible');
      const responses = op.responses as Record<string, unknown>;
      const accepted = responses[202] as Record<string, unknown>;
      const schema = (
        (accepted.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardIllustrationStatusResponse');
      expect(responses[422]).toBeDefined();
    });

    it('defines POST /storyboards/{draftId}/blocks/{blockId}/illustration', () => {
      const op = paths['/storyboards/{draftId}/blocks/{blockId}/illustration']?.['post'] as Record<
        string,
        unknown
      >;
      expect(op.operationId).toBe('startStoryboardBlockIllustration');
      expect(op.description).toContain('previous-scene prerequisites');
      const params = op.parameters as Array<Record<string, unknown>>;
      expect(params.find((param) => param.name === 'draftId')).toBeDefined();
      expect(params.find((param) => param.name === 'blockId')).toBeDefined();
      const responses = op.responses as Record<string, unknown>;
      const accepted = responses[202] as Record<string, unknown>;
      const schema = (
        (accepted.content as Record<string, unknown>)['application/json'] as Record<string, unknown>
      ).schema as Record<string, unknown>;
      expect(schema.$ref).toBe('#/components/schemas/StoryboardIllustrationStatusResponse');
      expect(responses[422]).toBeDefined();
    });

  });

  // ── T6 (AC-08 / AC-02 / AC-04b): principal-image routes removed + contract updated ────────

  describe('T6 — principal-image routes absent from openapi.ts (AC-08)', () => {
    it('does not declare POST .../principal-image/approve', () => {
      const path = paths['/storyboards/{draftId}/illustrations/principal-image/approve'];
      expect(path).toBeUndefined();
    });

    it('does not declare POST .../principal-image/edit', () => {
      const path = paths['/storyboards/{draftId}/illustrations/principal-image/edit'];
      expect(path).toBeUndefined();
    });

    it('does not declare POST .../principal-image/replace', () => {
      const path = paths['/storyboards/{draftId}/illustrations/principal-image/replace'];
      expect(path).toBeUndefined();
    });

    it('does not declare PUT .../principal-image/references', () => {
      const path = paths['/storyboards/{draftId}/illustrations/principal-image/references'];
      expect(path).toBeUndefined();
    });
  });

  describe('T6 — StoryboardIllustrationStatusResponse has no reference field (AC-08)', () => {
    const schemas = openApiSpec.components?.schemas as unknown as Record<string, Record<string, unknown>>;
    const statusSchema = schemas?.['StoryboardIllustrationStatusResponse'] as Record<string, unknown>;

    it('StoryboardIllustrationStatusResponse exists', () => {
      expect(statusSchema).toBeDefined();
    });

    it('does not list reference in required', () => {
      const required = statusSchema?.required as string[] | undefined;
      expect(required).not.toContain('reference');
    });

    it('does not have a reference property', () => {
      const properties = statusSchema?.properties as Record<string, unknown> | undefined;
      expect(properties).not.toHaveProperty('reference');
    });
  });

  describe('T6 — StoryboardAutomationStatus.phase has no principal-image values (AC-08)', () => {
    const schemas = openApiSpec.components?.schemas as unknown as Record<string, Record<string, unknown>>;
    const automationSchema = schemas?.['StoryboardAutomationStatus'] as Record<string, unknown>;
    const phaseEnum = (
      (automationSchema?.properties as Record<string, Record<string, unknown>>)?.['phase']?.enum
    ) as string[] | undefined;

    it('StoryboardAutomationStatus exists', () => {
      expect(automationSchema).toBeDefined();
    });

    it('phase enum does not contain creating_principal_image', () => {
      expect(phaseEnum).not.toContain('creating_principal_image');
    });

    it('phase enum does not contain awaiting_principal_approval', () => {
      expect(phaseEnum).not.toContain('awaiting_principal_approval');
    });
  });

  describe('T6 — POST /storyboards/{draftId}/illustrations declares 422 reference_gate_failed and unlinked_scenes (AC-02 / AC-04b)', () => {
    const op = paths['/storyboards/{draftId}/illustrations']?.['post'] as Record<string, unknown>;

    it('POST /storyboards/{draftId}/illustrations exists', () => {
      expect(op).toBeDefined();
    });

    it('has a 422 response', () => {
      const responses = op?.responses as Record<string, unknown>;
      expect(responses?.[422]).toBeDefined();
    });

    it('422 description mentions references.reference_gate_failed', () => {
      const responses = op?.responses as Record<string, unknown>;
      const desc422 = (responses?.[422] as Record<string, unknown>)?.description as string | undefined;
      expect(desc422).toContain('reference_gate_failed');
    });

    it('422 description mentions references.unlinked_scenes', () => {
      const responses = op?.responses as Record<string, unknown>;
      const desc422 = (responses?.[422] as Record<string, unknown>)?.description as string | undefined;
      expect(desc422).toContain('unlinked_scenes');
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
