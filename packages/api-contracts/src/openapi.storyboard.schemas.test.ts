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
    expect(required).toContain('videoPrompt');
    expect(required).toContain('mediaItems');
    expect(required).toContain('createdAt');
    expect(required).toContain('updatedAt');
  });

  it('StoryboardBlock.blockType enum covers start, end, scene', () => {
    const schema = schemas['StoryboardBlock'] as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blockType?.enum).toEqual(expect.arrayContaining(['start', 'end', 'scene']));
    expect(props.videoPrompt?.type).toEqual(['string', 'null']);
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

  it('defines StoryboardState schema with blocks, edges, and musicBlocks arrays', () => {
    const schema = schemas['StoryboardState'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
    expect(required).toContain('musicBlocks');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.blocks?.type).toBe('array');
    expect(props.edges?.type).toBe('array');
    expect(props.musicBlocks?.type).toBe('array');
    expect((props.musicBlocks?.items as Record<string, unknown>).$ref).toBe(
      '#/components/schemas/StoryboardMusicBlock',
    );
  });

  it('defines StoryboardMusicBlock schema with source modes and composition plans', () => {
    const schema = schemas['StoryboardMusicBlock'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toEqual([
      'id',
      'draftId',
      'name',
      'sourceMode',
      'prompt',
      'compositionPlan',
      'existingFileId',
      'startSceneBlockId',
      'endSceneBlockId',
      'positionX',
      'positionY',
      'sortOrder',
      'volume',
      'fadeInS',
      'fadeOutS',
      'loopMode',
      'generationStatus',
      'generationJobId',
      'outputFileId',
      'errorMessage',
      'createdAt',
      'updatedAt',
    ]);

    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.sourceMode?.$ref).toBe('#/components/schemas/StoryboardMusicSourceMode');
    expect(props.startSceneBlockId?.format).toBe('uuid');
    expect(props.endSceneBlockId?.format).toBe('uuid');
    expect(props.volume?.minimum).toBe(0);
    expect(props.volume?.maximum).toBe(1);
    expect(props.loopMode?.enum).toEqual(['loop', 'trim']);
    expect(props.generationStatus?.enum).toEqual(['queued', 'running', 'ready', 'failed', null]);

    const compositionPlan = props.compositionPlan?.oneOf as Array<Record<string, unknown>>;
    expect(compositionPlan[0]?.$ref).toBe('#/components/schemas/ElevenLabsCompositionPlan');
    expect(compositionPlan[1]?.type).toBe('null');
  });

  it('defines StoryboardMusicSourceMode component for referenced music schemas', () => {
    const schema = schemas['StoryboardMusicSourceMode'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema.type).toBe('string');
    expect(schema.enum).toEqual(['existing', 'generate_now', 'generate_on_step3']);
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

  it('defines CreateStoryboardProjectBody schema', () => {
    const schema = schemas['CreateStoryboardProjectBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.mode?.enum).toEqual(['images', 'videos']);
    expect(props.mode?.default).toBe('images');
  });

  it('defines StoryboardIllustrationStatusResponse schema', () => {
    const item = schemas['StoryboardIllustrationStatusItem'] as Record<string, unknown>;
    expect(item).toBeDefined();
    const itemRequired = item.required as string[];
    expect(itemRequired).toEqual(['blockId', 'status', 'jobId', 'outputFileId', 'errorMessage']);
    const itemProps = item.properties as Record<string, Record<string, unknown>>;
    expect(itemProps.status?.enum).toEqual(['queued', 'running', 'ready', 'failed']);

    const automation = schemas['StoryboardAutomationStatus'] as Record<string, unknown>;
    expect(automation).toBeDefined();
    expect(automation.required).toEqual(['phase', 'planningJobId', 'errorMessage']);
    const automationProps = automation.properties as Record<string, Record<string, unknown>>;
    // T6: creating_principal_image and awaiting_principal_approval removed from phase enum
    expect(automationProps.phase?.enum).toEqual([
      'idle',
      'planning',
      'generating_scene_illustrations',
      'ready',
      'failed',
    ]);
    expect(automationProps.phase?.enum).not.toContain('creating_principal_image');
    expect(automationProps.phase?.enum).not.toContain('awaiting_principal_approval');

    const response = schemas['StoryboardIllustrationStatusResponse'] as Record<string, unknown>;
    expect(response).toBeDefined();
    // T6: reference field removed from required and properties
    expect(response.required).toEqual(['automation', 'items']);
    expect(response.required).not.toContain('reference');
    const props = response.properties as Record<string, Record<string, unknown>>;
    expect(props.automation?.$ref).toBe('#/components/schemas/StoryboardAutomationStatus');
    expect(props).not.toHaveProperty('reference');
    const items = props.items?.items as Record<string, unknown>;
    expect(items.$ref).toBe('#/components/schemas/StoryboardIllustrationStatusItem');
    // T6: example no longer uses principal-image phases
    const example = response.example as {
      automation?: Record<string, unknown>;
      items?: unknown[];
    };
    expect(example.automation?.phase).toBe('generating_scene_illustrations');
    expect(example).not.toHaveProperty('reference');
    expect(example.items).toHaveLength(1);
  });

  it('defines storyboard video generation schemas', () => {
    const body = schemas['StartStoryboardVideosBody'] as Record<string, unknown>;
    expect(body).toBeDefined();
    expect(body.required).toEqual(['modelId']);
    expect(body.additionalProperties).toBe(false);
    const bodyProps = body.properties as Record<string, Record<string, unknown>>;
    expect(bodyProps.generateAudio?.default).toBe(false);

    const item = schemas['StoryboardVideoStatusItem'] as Record<string, unknown>;
    expect(item).toBeDefined();
    expect(item.required).toEqual([
      'blockId',
      'status',
      'jobId',
      'modelId',
      'generateAudio',
      'outputFileId',
      'errorMessage',
    ]);
    const itemProps = item.properties as Record<string, Record<string, unknown>>;
    expect(itemProps.status?.enum).toEqual(['queued', 'running', 'ready', 'failed']);
    expect(itemProps.generateAudio?.type).toBe('boolean');

    const response = schemas['StoryboardVideoStatusResponse'] as Record<string, unknown>;
    expect(response).toBeDefined();
    expect(response.required).toEqual(['items']);
    const responseProps = response.properties as Record<string, Record<string, unknown>>;
    const items = responseProps.items?.items as Record<string, unknown>;
    expect(items.$ref).toBe('#/components/schemas/StoryboardVideoStatusItem');
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

  it('defines SaveStoryboardBody schema with blocks, edges, and optional musicBlocks', () => {
    const schema = schemas['SaveStoryboardBody'] as Record<string, unknown>;
    expect(schema).toBeDefined();
    const required = schema.required as string[];
    expect(required).toContain('blocks');
    expect(required).toContain('edges');
    expect(required).not.toContain('musicBlocks');
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect((props.musicBlocks?.items as Record<string, unknown>).$ref).toBe(
      '#/components/schemas/MusicBlockInsert',
    );
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
    ['/storyboards/{draftId}/videos', 'get'],
    ['/storyboards/{draftId}/videos', 'post'],
    ['/storyboards/{draftId}/illustrations', 'get'],
    ['/storyboards/{draftId}/illustrations', 'post'],
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
