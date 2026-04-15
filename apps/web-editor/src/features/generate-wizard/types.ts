/**
 * Feature-local types for the generate-wizard feature.
 *
 * Re-exports `PromptDoc` and its block types from the schema package so that
 * wizard components depend on a single feature-local entry point.
 */

export type {
  PromptDoc,
  PromptBlock,
  TextBlock,
  MediaRefBlock,
} from '@ai-video-editor/project-schema';

/** The three steps of the video generation wizard. */
export type WizardStep = 1 | 2 | 3;

/** Metadata for a single wizard step node. */
export type WizardStepMeta = {
  step: WizardStep;
  label: string;
};
