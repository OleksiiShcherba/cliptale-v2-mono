/**
 * Timeline feature-local types.
 *
 * Domain types (Track, Clip) come from `@ai-video-editor/project-schema`.
 * These types are specific to the timeline UI layer.
 */

/** Track type to background color mapping for clip lane and header styling. */
export type TrackColor = {
  bg: string;
  text: string;
};
