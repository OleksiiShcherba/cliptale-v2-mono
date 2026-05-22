import { describe, it, expect } from 'vitest';

import { openApiSpec } from './openapi.js';

// ── Helper types ─────────────────────────────────────────────────────────────

type PathItem = Record<string, unknown>;
type Paths = Record<string, PathItem>;

const paths = openApiSpec.paths as unknown as Paths;
const schemas = (openApiSpec.components as { schemas: Record<string, unknown> }).schemas;

// ── Storyboard schema tests ──────────────────────────────────────────────────

describe('openApiSpec storyboard component schemas', () => {
  it('defines BlockMediaItem schema with required fields', () => {
    const schema = schemas['BlockMediaItem'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('fileId');
    expect(required).toContain('mediaType');
    expect(required).toContain('sortOrder');
  });

  it('defines StoryboardBlock schema with required fields', () => {
    const schema = schemas['StoryboardBlock'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('blockType');
    expect(required).toContain('mediaItems');
    expect(required).toContain('createdAt');
    expect(required).toContain('updatedAt');
  });

  it('StoryboardBlock.blockType enum covers start, end, scene', () => {
    const schema = schemas['StoryboardBlock'] as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blockType?.enum).toEqual(expect.arrayContaining(['start', 'end', 'scene']));
  });

  it('defines StoryboardEdge schema with required fields', () => {
    const schema = schemas['StoryboardEdge'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('sourceBlockId');
    expect(required).toContain('targetBlockId');
  });

  it('defines StoryboardState schema with blocks and edges arrays', () => {
    const schema = schemas['StoryboardState'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blocks?.type).toBe('array');
    expect(props.edges?.type).toBe('array');
  });

  it('defines StoryboardProjectCreateResponse schema', () => {
    const schema = schemas['StoryboardProjectCreateResponse'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema.required).toEqual(['projectId', 'versionId']);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.projectId?.format).toBe('uuid');
    expect(props.versionId?.type).toBe('integer');
    expect(props.versionId?.minimum).toBe(1);
  });

  it('defines StoryboardIllustrationStatusResponse schema', () => {
    const item = schemas['StoryboardIllustrationStatusItem'] as Record<string, unknown>;
    expect(item).toBeDefined();
    const itemRequired = item.required as string[];
    expect(itemRequired).toEqual(['blockId', 'status', 'jobId', 'outputFileId', 'errorMessage']);
    const itemProps = item.properties as Record<string, Record<string, unknown>>;
    expect(itemProps.status?.enum).toEqual(['queued', 'running', 'ready', 'failed']);

    const reference = schemas['StoryboardIllustrationReferenceStatus'] as Record<string, unknown>;
    expect(reference).toBeDefined();
    expect(reference.required).toEqual([
      'status',
      'jobId',
      'outputFileId',
      'sourceReferenceFileIds',
      'approvalStatus',
      'errorMessage',
    ]);
    const referenceProps = reference.properties as Record<string, Record<string, unknown>>;
    expect(referenceProps.status?.enum).toEqual(['queued', 'running', 'ready', 'failed']);
    expect(referenceProps.sourceReferenceFileIds?.type).toBe('array');
    expect(referenceProps.approvalStatus?.enum).toEqual(['pending', 'approved']);

    const automation = schemas['StoryboardAutomationStatus'] as Record<string, unknown>;
    expect(automation).toBeDefined();
    expect(automation.required).toEqual(['phase', 'planningJobId', 'errorMessage']);
    const automationProps = automation.properties as Record<string, Record<string, unknown>>;
    expect(automationProps.phase?.enum).toEqual([
      'idle',
      'planning',
      'creating_principal_image',
      'awaiting_principal_approval',
      'generating_scene_illustrations',
      'ready',
      'failed',
    ]);

    const response = schemas['StoryboardIllustrationStatusResponse'] as Record<string, unknown>;
    expect(response).toBeDefined();
    expect(response.required).toEqual(['automation', 'reference', 'items']);
    const props = response.properties as Record<string, Record<string, unknown>>;
    expect(props.automation?.$ref).toBe('#/components/schemas/StoryboardAutomationStatus');
    expect(props.reference?.$ref).toBe('#/components/schemas/StoryboardIllustrationReferenceStatus');
    const items = props.items?.items as Record<string, unknown>;
    expect(items.$ref).toBe('#/components/schemas/StoryboardIllustrationStatusItem');
    const example = response.example as {
      automation?: Record<string, unknown>;
      reference?: Record<string, unknown>;
      items?: unknown[];
    };
    expect(example.automation?.phase).toBe('creating_principal_image');
    expect(example.reference?.status).toBe('running');
    expect(example.items).toHaveLength(1);
  });

  it('defines principal image action body schemas', () => {
    const edit = schemas['EditPrincipalImageBody'] as Record<string, unknown>;
    expect(edit.required).toEqual(['prompt']);
    const editProps = edit.properties as Record<string, Record<string, unknown>>;
    expect(editProps.prompt?.maxLength).toBe(4000);
    expect(editProps.extraReferenceFileIds?.type).toBe('array');

    const replace = schemas['ReplacePrincipalImageBody'] as Record<string, unknown>;
    expect(replace.required).toEqual(['fileId']);

    const refs = schemas['SetPrincipalImageReferencesBody'] as Record<string, unknown>;
    expect(refs.required).toEqual(['fileIds']);
  });

  it('defines SaveStoryboardBody schema with blocks and edges', () => {
    const schema = schemas['SaveStoryboardBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
  });

  it('defines PushHistoryBody schema with required snapshot field', () => {
    const schema = schemas['PushHistoryBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('snapshot');
  });

  it('defines StoryboardHistoryEntry schema with required id, draftId, snapshot, createdAt', () => {
    const schema = schemas['StoryboardHistoryEntry'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('id');
    expect(required).toContain('draftId');
    expect(required).toContain('snapshot');
    expect(required).toContain('createdAt');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    // id must be integer type (auto-incremented row id)
    expect(props.id?.type).toBe('integer');
  });
});

// ── All storyboard operations have bearerAuth ────────────────────────────────

describe('openApiSpec storyboard security coverage', () => {
  const storyboardPaths = [
    ['/storyboards/{draftId}/initialize', 'post'],
    ['/storyboards/{draftId}/apply-latest-plan', 'post'],
    ['/storyboards/{draftId}/project', 'post'],
    ['/storyboards/{draftId}/illustrations', 'get'],
    ['/storyboards/{draftId}/illustrations', 'post'],
    ['/storyboards/{draftId}/illustrations/principal-image/approve', 'post'],
    ['/storyboards/{draftId}/illustrations/principal-image/edit', 'post'],
    ['/storyboards/{draftId}/illustrations/principal-image/replace', 'post'],
    ['/storyboards/{draftId}/illustrations/principal-image/references', 'put'],
    ['/storyboards/{draftId}/blocks/{blockId}/illustration', 'post'],
    ['/storyboards/{draftId}', 'get'],
    ['/storyboards/{draftId}', 'put'],
    ['/storyboards/{draftId}/history', 'get'],
    ['/storyboards/{draftId}/history', 'post'],
  ] as const;

  it.each(storyboardPaths)(
    '%s %s declares bearerAuth security',
    (path, method) => {
      const op = paths[path]?.[method] as Record<string, unknown>;
      const security = op?.security as Array<Record<string, unknown>>;
      expect(security).toEqual(expect.arrayContaining([{ bearerAuth: [] }]));
    },
  );

  it.each(storyboardPaths)(
    '%s %s declares storyboard tag',
    (path, method) => {
      const op = paths[path]?.[method] as Record<string, unknown>;
      expect(op?.tags).toContain('storyboard');
    },
  );
});
