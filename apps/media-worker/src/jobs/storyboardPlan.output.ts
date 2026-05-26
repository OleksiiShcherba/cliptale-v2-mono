import { z } from 'zod';

import {
  storyboardPlanSchema,
  type StoryboardPlan,
} from '@ai-video-editor/project-schema';

export class StoryboardPlanOutputParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanOutputParseError';
  }
}

export class StoryboardPlanSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardPlanSchemaValidationError';
  }
}

export function parseStoryboardPlanJson(rawOutput: string): unknown {
  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Malformed JSON';
    throw new StoryboardPlanOutputParseError(`OpenAI returned malformed storyboard JSON: ${message}`);
  }
}

export function validateStoryboardPlan(rawPlan: unknown): StoryboardPlan {
  const result = storyboardPlanSchema.safeParse(normalizeStoryboardPlanCandidate(rawPlan));
  if (!result.success) {
    const details = result.error.issues.flatMap(formatZodIssue).slice(0, 8).join('; ');
    throw new StoryboardPlanSchemaValidationError(`OpenAI storyboard plan failed schema validation: ${details}`);
  }
  validateStoryboardPlanMusicDefaults(result.data);
  return result.data;
}

function validateStoryboardPlanMusicDefaults(plan: StoryboardPlan): void {
  for (const [index, musicSegment] of plan.musicSegments.entries()) {
    if (musicSegment.sourceMode !== 'generate_on_step3') {
      throw new StoryboardPlanSchemaValidationError(
        `OpenAI storyboard plan failed schema validation: musicSegments.${index}.sourceMode must be generate_on_step3`,
      );
    }

    for (const [sectionIndex, section] of musicSegment.compositionPlan.sections.entries()) {
      if (section.lines.length > 0) {
        throw new StoryboardPlanSchemaValidationError(
          `OpenAI storyboard plan failed schema validation: musicSegments.${index}.compositionPlan.sections.${sectionIndex}.lines must be empty for default instrumental music`,
        );
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pickValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function normalizeReferencedMedia(rawMedia: unknown): unknown {
  if (!isRecord(rawMedia)) return rawMedia;

  return {
    fileId: pickValue(rawMedia, ['fileId', 'file_id']),
    mediaType: pickValue(rawMedia, ['mediaType', 'media_type']),
    label: rawMedia.label,
  };
}

function normalizeScene(rawScene: unknown): unknown {
  if (!isRecord(rawScene)) return rawScene;

  const referencedMedia = pickValue(rawScene, ['referencedMedia', 'referenced_media']);

  return {
    sceneNumber: pickValue(rawScene, ['sceneNumber', 'scene_number']),
    prompt: rawScene.prompt,
    visualPrompt: pickValue(rawScene, ['visualPrompt', 'visual_prompt']),
    videoPrompt: pickValue(rawScene, ['videoPrompt', 'video_prompt']),
    durationSeconds: pickValue(rawScene, ['durationSeconds', 'duration_seconds']),
    referencedMedia: Array.isArray(referencedMedia) ? referencedMedia.map(normalizeReferencedMedia) : referencedMedia,
    transitionNotes: pickValue(rawScene, ['transitionNotes', 'transition_notes']),
    style: rawScene.style,
  };
}

function normalizeCompositionPlan(rawPlan: unknown, fallback: {
  name: unknown;
  durationMs: number | null;
}): unknown {
  if (!isRecord(rawPlan)) return rawPlan;

  const sections = pickValue(rawPlan, ['sections', 'musicSections', 'music_sections', 'segments']);

  return {
    positive_global_styles: pickValue(rawPlan, ['positive_global_styles', 'positiveGlobalStyles']),
    negative_global_styles: pickValue(rawPlan, ['negative_global_styles', 'negativeGlobalStyles']),
    sections: Array.isArray(sections) ? sections.map(normalizeCompositionPlanSection) : makeFallbackSections(fallback),
  };
}

function normalizeCompositionPlanSection(rawSection: unknown): unknown {
  if (!isRecord(rawSection)) return rawSection;

  const durationMs = pickValue(rawSection, ['duration_ms', 'durationMs']);
  const durationSeconds = pickValue(rawSection, ['duration_seconds', 'durationSeconds']);

  return {
    section_name: pickValue(rawSection, ['section_name', 'sectionName', 'name']),
    positive_local_styles: pickValue(rawSection, ['positive_local_styles', 'positiveLocalStyles']),
    negative_local_styles: pickValue(rawSection, ['negative_local_styles', 'negativeLocalStyles']),
    duration_ms:
      durationMs ??
      (typeof durationSeconds === 'number' ? Math.round(durationSeconds * 1_000) : durationSeconds),
    lines: pickValue(rawSection, ['lines', 'lyrics']),
  };
}

function makeFallbackSections(fallback: {
  name: unknown;
  durationMs: number | null;
}): unknown[] | undefined {
  if (!fallback.durationMs) return undefined;

  return [
    {
      section_name: typeof fallback.name === 'string' && fallback.name.trim().length > 0
        ? fallback.name.slice(0, 100)
        : 'Main cue',
      positive_local_styles: ['instrumental'],
      negative_local_styles: ['vocals', 'lyrics', 'singing'],
      duration_ms: fallback.durationMs,
      lines: [],
    },
  ];
}

function normalizeMusicSegment(rawSegment: unknown, normalizedScenes: unknown): unknown {
  if (!isRecord(rawSegment)) return rawSegment;

  const startSceneNumber = pickValue(rawSegment, ['startSceneNumber', 'start_scene_number']);
  const endSceneNumber = pickValue(rawSegment, ['endSceneNumber', 'end_scene_number']);

  return {
    name: rawSegment.name,
    prompt: rawSegment.prompt,
    compositionPlan: normalizeCompositionPlan(pickValue(rawSegment, ['compositionPlan', 'composition_plan']), {
      name: rawSegment.name,
      durationMs: getCoveredSceneDurationMs(normalizedScenes, startSceneNumber, endSceneNumber),
    }),
    startSceneNumber,
    endSceneNumber,
    sourceMode: pickValue(rawSegment, ['sourceMode', 'source_mode']),
  };
}

function getCoveredSceneDurationMs(
  normalizedScenes: unknown,
  startSceneNumber: unknown,
  endSceneNumber: unknown,
): number | null {
  if (!Array.isArray(normalizedScenes) || typeof startSceneNumber !== 'number' || typeof endSceneNumber !== 'number') {
    return null;
  }

  const totalSeconds = normalizedScenes.slice(startSceneNumber - 1, endSceneNumber).reduce((sum, scene) => {
    if (!isRecord(scene) || typeof scene.durationSeconds !== 'number') return sum;
    return sum + scene.durationSeconds;
  }, 0);

  return totalSeconds > 0 ? Math.round(totalSeconds * 1_000) : null;
}

function normalizeStoryboardPlanCandidate(rawPlan: unknown): unknown {
  if (!isRecord(rawPlan)) return rawPlan;

  const wrappedPlan = pickValue(rawPlan, ['storyboardPlan', 'storyboard_plan', 'plan']);
  const plan = isRecord(wrappedPlan) ? wrappedPlan : rawPlan;
  const scenes = plan.scenes;
  const musicSegments = pickValue(plan, ['musicSegments', 'music_segments']);
  const normalizedScenes = Array.isArray(scenes) ? scenes.map(normalizeScene) : scenes;

  return {
    schemaVersion: pickValue(plan, ['schemaVersion', 'schema_version']),
    videoLengthSeconds: pickValue(plan, ['videoLengthSeconds', 'video_length_seconds']),
    sceneCount: pickValue(plan, ['sceneCount', 'scene_count']),
    scenes: normalizedScenes,
    musicSegments: Array.isArray(musicSegments)
      ? musicSegments.map((segment) => normalizeMusicSegment(segment, normalizedScenes))
      : musicSegments,
  };
}

function formatZodIssue(issue: z.ZodIssue): string[] {
  if (issue.code === 'invalid_union') {
    const unionErrors = (issue as z.ZodInvalidUnionIssue).unionErrors;
    const formattedErrors = unionErrors.map((error) => error.issues.flatMap(formatZodIssue));
    const preferredErrors = formattedErrors.find((errors) =>
      !errors.includes('schemaVersion: Invalid literal value, expected 1') &&
      !errors.some((error) => error.includes("Unrecognized key(s) in object: 'musicSegments'")),
    );
    return preferredErrors ?? formattedErrors.flat();
  }

  const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
  return [`${path}: ${issue.message}`];
}
