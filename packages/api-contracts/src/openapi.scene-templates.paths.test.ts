/**
 * Tests for the 6 scene-template paths added in ST-B1 to openApiSpec.paths,
 * and the 3 new component schemas (SceneTemplate, SceneTemplateMedia,
 * AddToStoryboardPayload).
 */

import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

type PathItem = Record<string, unknown>;
type Paths = Record<string, PathItem>;
type Schemas = Record<string, Record<string, unknown>>;

const paths = openApiSpec.paths as unknown as Paths;
const schemas = (openApiSpec as unknown as { components: { schemas: Schemas } }).components
  .schemas;

// ── /scene-templates ──────────────────────────────────────────────────────────

describe('GET /scene-templates', () => {
  const op = paths['/scene-templates']?.['get'] as Record<string, unknown>;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId listSceneTemplates', () => {
    expect(op.operationId).toBe('listSceneTemplates');
  });

  it('is tagged scene-templates', () => {
    expect(op.tags).toContain('scene-templates');
  });

  it('requires bearerAuth security', () => {
    const security = op.security as Array<Record<string, unknown>>;
    expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
  });

  it('responds 200 with items array of SceneTemplate refs', () => {
    const responses = op.responses as Record<string, unknown>;
    const ok = responses[200] as Record<string, unknown>;
    const schema = (
      (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
    )?.schema as Record<string, unknown>;
    const props = schema?.properties as Record<string, Record<string, unknown>>;
    expect(props?.items?.type).toBe('array');
    const items = props?.items?.items as Record<string, unknown>;
    expect(items?.$ref).toBe('#/components/schemas/SceneTemplate');
  });

  it('responds 401', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[401]).toBeDefined();
  });
});

describe('POST /scene-templates', () => {
  const op = paths['/scene-templates']?.['post'] as Record<string, unknown>;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId createSceneTemplate', () => {
    expect(op.operationId).toBe('createSceneTemplate');
  });

  it('is tagged scene-templates', () => {
    expect(op.tags).toContain('scene-templates');
  });

  it('requires bearerAuth security', () => {
    const security = op.security as Array<Record<string, unknown>>;
    expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
  });

  it('has a required requestBody with CreateSceneTemplateBody schema ref', () => {
    const requestBody = op.requestBody as Record<string, unknown>;
    expect(requestBody?.required).toBe(true);
    const schema = (
      (requestBody?.content as Record<string, unknown>)?.['application/json'] as Record<
        string,
        unknown
      >
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/CreateSceneTemplateBody');
  });

  it('responds 201 with SceneTemplate schema ref', () => {
    const responses = op.responses as Record<string, unknown>;
    const created = responses[201] as Record<string, unknown>;
    const schema = (
      (created?.content as Record<string, unknown>)?.['application/json'] as Record<
        string,
        unknown
      >
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/SceneTemplate');
  });

  it('responds 400 and 401', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[400]).toBeDefined();
    expect(responses[401]).toBeDefined();
  });
});

// ── /scene-templates/{id} ─────────────────────────────────────────────────────

describe('GET /scene-templates/{id}', () => {
  const op = paths['/scene-templates/{id}']?.['get'] as Record<string, unknown>;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId getSceneTemplate', () => {
    expect(op.operationId).toBe('getSceneTemplate');
  });

  it('has an id path parameter', () => {
    const params = op.parameters as Array<Record<string, unknown>>;
    const idParam = params?.find((p) => p.name === 'id');
    expect(idParam).toBeDefined();
    expect(idParam?.in).toBe('path');
    expect(idParam?.required).toBe(true);
  });

  it('responds 200 with SceneTemplate schema ref', () => {
    const responses = op.responses as Record<string, unknown>;
    const ok = responses[200] as Record<string, unknown>;
    const schema = (
      (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/SceneTemplate');
  });

  it('responds 401 and 404', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[401]).toBeDefined();
    expect(responses[404]).toBeDefined();
  });
});

describe('PUT /scene-templates/{id}', () => {
  const op = paths['/scene-templates/{id}']?.['put'] as Record<string, unknown>;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId updateSceneTemplate', () => {
    expect(op.operationId).toBe('updateSceneTemplate');
  });

  it('has a required requestBody with CreateSceneTemplateBody schema ref', () => {
    const requestBody = op.requestBody as Record<string, unknown>;
    expect(requestBody?.required).toBe(true);
    const schema = (
      (requestBody?.content as Record<string, unknown>)?.['application/json'] as Record<
        string,
        unknown
      >
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/CreateSceneTemplateBody');
  });

  it('responds 200 with SceneTemplate schema ref', () => {
    const responses = op.responses as Record<string, unknown>;
    const ok = responses[200] as Record<string, unknown>;
    const schema = (
      (ok?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/SceneTemplate');
  });

  it('responds 400, 401, and 404', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[400]).toBeDefined();
    expect(responses[401]).toBeDefined();
    expect(responses[404]).toBeDefined();
  });
});

describe('DELETE /scene-templates/{id}', () => {
  const op = paths['/scene-templates/{id}']?.['delete'] as Record<string, unknown>;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId deleteSceneTemplate', () => {
    expect(op.operationId).toBe('deleteSceneTemplate');
  });

  it('responds 204, 401, and 404', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[204]).toBeDefined();
    expect(responses[401]).toBeDefined();
    expect(responses[404]).toBeDefined();
  });
});

// ── /scene-templates/{id}/add-to-storyboard ───────────────────────────────────

describe('POST /scene-templates/{id}/add-to-storyboard', () => {
  const op = paths['/scene-templates/{id}/add-to-storyboard']?.['post'] as Record<
    string,
    unknown
  >;

  it('exists in the spec', () => {
    expect(op).toBeDefined();
  });

  it('has operationId addSceneTemplateToStoryboard', () => {
    expect(op.operationId).toBe('addSceneTemplateToStoryboard');
  });

  it('is tagged scene-templates', () => {
    expect(op.tags).toContain('scene-templates');
  });

  it('has an id path parameter', () => {
    const params = op.parameters as Array<Record<string, unknown>>;
    const idParam = params?.find((p) => p.name === 'id');
    expect(idParam).toBeDefined();
    expect(idParam?.in).toBe('path');
    expect(idParam?.required).toBe(true);
  });

  it('has a required requestBody with AddToStoryboardPayload schema ref', () => {
    const requestBody = op.requestBody as Record<string, unknown>;
    expect(requestBody?.required).toBe(true);
    const schema = (
      (requestBody?.content as Record<string, unknown>)?.['application/json'] as Record<
        string,
        unknown
      >
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/AddToStoryboardPayload');
  });

  it('responds 201 with StoryboardBlock schema ref', () => {
    const responses = op.responses as Record<string, unknown>;
    const created = responses[201] as Record<string, unknown>;
    const schema = (
      (created?.content as Record<string, unknown>)?.['application/json'] as Record<
        string,
        unknown
      >
    )?.schema as Record<string, unknown>;
    expect(schema?.$ref).toBe('#/components/schemas/StoryboardBlock');
  });

  it('responds 400, 401, 403, and 404', () => {
    const responses = op.responses as Record<string, unknown>;
    expect(responses[400]).toBeDefined();
    expect(responses[401]).toBeDefined();
    expect(responses[403]).toBeDefined();
    expect(responses[404]).toBeDefined();
  });
});

// ── Component schemas ─────────────────────────────────────────────────────────

describe('SceneTemplateMedia schema', () => {
  const schema = schemas['SceneTemplateMedia'];

  it('exists in components.schemas', () => {
    expect(schema).toBeDefined();
  });

  it('has required fields: id, fileId, mediaType, sortOrder', () => {
    expect(schema?.required).toEqual(
      expect.arrayContaining(['id', 'fileId', 'mediaType', 'sortOrder']),
    );
  });

  it('mediaType is an enum of image/video/audio', () => {
    const props = schema?.properties as Record<string, Record<string, unknown>>;
    expect(props?.mediaType?.enum).toEqual(expect.arrayContaining(['image', 'video', 'audio']));
  });
});

describe('SceneTemplate schema', () => {
  const schema = schemas['SceneTemplate'];

  it('exists in components.schemas', () => {
    expect(schema).toBeDefined();
  });

  it('has required fields including mediaItems', () => {
    expect(schema?.required).toEqual(
      expect.arrayContaining([
        'id', 'userId', 'name', 'prompt', 'durationS', 'style',
        'createdAt', 'updatedAt', 'mediaItems',
      ]),
    );
  });

  it('mediaItems is an array of SceneTemplateMedia refs', () => {
    const props = schema?.properties as Record<string, Record<string, unknown>>;
    expect(props?.mediaItems?.type).toBe('array');
    const items = props?.mediaItems?.items as Record<string, unknown>;
    expect(items?.$ref).toBe('#/components/schemas/SceneTemplateMedia');
  });
});

describe('AddToStoryboardPayload schema', () => {
  const schema = schemas['AddToStoryboardPayload'];

  it('exists in components.schemas', () => {
    expect(schema).toBeDefined();
  });

  it('has draftId as a required field', () => {
    expect(schema?.required).toEqual(expect.arrayContaining(['draftId']));
  });

  it('has optional positionX and positionY properties', () => {
    const props = schema?.properties as Record<string, Record<string, unknown>>;
    expect(props?.positionX).toBeDefined();
    expect(props?.positionY).toBeDefined();
  });
});
