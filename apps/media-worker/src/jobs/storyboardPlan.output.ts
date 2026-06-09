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
  const normalizedSections = Array.isArray(sections)
    ? normalizeCompositionPlanSections(sections, fallback)
    : makeFallbackSections(fallback);

  return {
    positive_global_styles: pickValue(rawPlan, ['positive_global_styles', 'positiveGlobalStyles']),
    negative_global_styles: pickValue(rawPlan, ['negative_global_styles', 'negativeGlobalStyles']),
    sections: normalizedSections,
  };
}

function normalizeCompositionPlanSections(
  sections: unknown[],
  fallback: {
    name: unknown;
    durationMs: number | null;
  },
): unknown[] {
  const fallbackDurationMs = fallback.durationMs && sections.length > 0
    ? Math.round(fallback.durationMs / sections.length)
    : null;

  const normalized = sections.map((section, index) =>
    normalizeCompositionPlanSection(section, {
      name: fallback.name,
      index,
      durationMs: fallbackDurationMs,
    }),
  );

  return reconcileSectionDurationsMs(normalized, fallback.durationMs);
}

/**
 * Rescale a list of integer-millisecond durations so they sum exactly to `targetMs`,
 * preserving each entry's relative proportion. The model is asked to make these durations
 * add up, but its arithmetic drifts by a few hundred milliseconds; the strict schema then
 * hard-fails the whole job. Reconciling the small drift here turns that validation into a
 * safety net instead of a hard gate. Returns the input untouched when reconciliation is not
 * safely possible (non-numeric or non-positive durations, or no usable target), so genuinely
 * malformed output still surfaces as a validation error.
 */
function reconcileIntegerMsDurations(values: number[], targetMs: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values;

  const scaled = values.map((value) => Math.max(1, Math.round((value * targetMs) / total)));
  const residual = targetMs - scaled.reduce((sum, value) => sum + value, 0);

  let largestIndex = 0;
  for (let index = 1; index < scaled.length; index += 1) {
    if (scaled[index]! > scaled[largestIndex]!) largestIndex = index;
  }
  scaled[largestIndex] = Math.max(1, scaled[largestIndex]! + residual);

  return scaled;
}

function reconcileSectionDurationsMs(sections: unknown[], targetMs: number | null): unknown[] {
  if (targetMs === null || !Number.isFinite(targetMs) || targetMs <= 0) return sections;

  const durations = sections.map((section) =>
    isRecord(section) && typeof section.duration_ms === 'number' ? section.duration_ms : null,
  );
  if (durations.some((duration) => duration === null || !Number.isFinite(duration) || duration <= 0)) {
    return sections;
  }

  const reconciled = reconcileIntegerMsDurations(durations as number[], Math.round(targetMs));
  return sections.map((section, index) =>
    isRecord(section) ? { ...section, duration_ms: reconciled[index] } : section,
  );
}

function reconcileSceneDurations(scenes: unknown[], videoLengthSeconds: unknown): unknown[] {
  if (typeof videoLengthSeconds !== 'number' || !Number.isFinite(videoLengthSeconds) || videoLengthSeconds <= 0) {
    return scenes;
  }

  const durationsMs = scenes.map((scene) =>
    isRecord(scene) &&
    typeof scene.durationSeconds === 'number' &&
    Number.isFinite(scene.durationSeconds) &&
    scene.durationSeconds > 0
      ? Math.round(scene.durationSeconds * 1_000)
      : null,
  );
  if (durationsMs.some((duration) => duration === null)) return scenes;

  const reconciled = reconcileIntegerMsDurations(durationsMs as number[], Math.round(videoLengthSeconds * 1_000));
  return scenes.map((scene, index) =>
    isRecord(scene) ? { ...scene, durationSeconds: reconciled[index]! / 1_000 } : scene,
  );
}

function normalizeCompositionPlanSection(rawSection: unknown, fallback: {
  name: unknown;
  index: number;
  durationMs: number | null;
}): unknown {
  if (!isRecord(rawSection)) return rawSection;

  const rawDurationMs = pickValue(rawSection, ['duration_ms', 'durationMs']);
  const rawDuration = rawDurationMs ?? pickValue(rawSection, ['duration']);
  const rawDurationSeconds = pickValue(rawSection, ['duration_seconds', 'durationSeconds']);
  const durationMs = normalizeDurationMs(rawDurationMs, rawDuration, rawDurationSeconds, fallback.durationMs);
  const sectionName = pickValue(rawSection, ['section_name', 'sectionName', 'name', 'title', 'label']);

  return {
    section_name: typeof sectionName === 'string'
      ? sectionName
      : makeFallbackSectionName(fallback.name, fallback.index),
    positive_local_styles: pickValue(rawSection, ['positive_local_styles', 'positiveLocalStyles']),
    negative_local_styles: pickValue(rawSection, ['negative_local_styles', 'negativeLocalStyles']),
    duration_ms: durationMs,
    lines: pickValue(rawSection, ['lines', 'lyrics']),
  };
}

function normalizeDurationMs(
  explicitDurationMs: unknown,
  duration: unknown,
  durationSeconds: unknown,
  fallbackDurationMs: number | null,
): unknown {
  if (explicitDurationMs !== undefined) {
    return explicitDurationMs;
  }

  if (typeof duration === 'number') {
    return duration > 0 && duration <= 600 ? Math.round(duration * 1_000) : duration;
  }

  if (typeof durationSeconds === 'number') {
    return Math.round(durationSeconds * 1_000);
  }

  return fallbackDurationMs ?? duration ?? durationSeconds;
}

function makeFallbackSectionName(name: unknown, index: number): string {
  const prefix = typeof name === 'string' && name.trim().length > 0
    ? name.trim()
    : 'Main cue';
  const suffix = index > 0 ? ` ${index + 1}` : '';
  return `${prefix}${suffix}`.slice(0, 100);
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
  const videoLengthSeconds = pickValue(plan, ['videoLengthSeconds', 'video_length_seconds']);
  const musicSegments = pickValue(plan, ['musicSegments', 'music_segments']);
  // Reconcile scene drift first so music segments measure their covered range against the
  // same durations the schema validates.
  const normalizedScenes = Array.isArray(scenes)
    ? reconcileSceneDurations(scenes.map(normalizeScene), videoLengthSeconds)
    : scenes;

  return {
    schemaVersion: pickValue(plan, ['schemaVersion', 'schema_version']),
    videoLengthSeconds,
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
