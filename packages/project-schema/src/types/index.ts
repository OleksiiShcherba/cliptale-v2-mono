import { z } from 'zod';

import { projectDocSchema } from '../schemas/project-doc.schema.js';
import { trackSchema } from '../schemas/track.schema.js';
import { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema } from '../schemas/clip.schema.js';

/** The root project document stored in the database and exchanged between client and server. */
export type ProjectDoc = z.infer<typeof projectDocSchema>;

/** A single track lane in the timeline (video, audio, or text-overlay). */
export type Track = z.infer<typeof trackSchema>;

/** Discriminated union of all clip types that can appear on a track. */
export type Clip = z.infer<typeof clipSchema>;

/** A video clip referencing an uploaded video asset. */
export type VideoClip = z.infer<typeof videoClipSchema>;

/** An audio clip referencing an uploaded audio asset. */
export type AudioClip = z.infer<typeof audioClipSchema>;

/** A text overlay clip rendered on top of the video composition. */
export type TextOverlayClip = z.infer<typeof textOverlayClipSchema>;
