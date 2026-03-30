import { z } from 'zod';

import { projectDocSchema } from '../schemas/project-doc.schema.js';
import { trackSchema } from '../schemas/track.schema.js';
import { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema } from '../schemas/clip.schema.js';

export type ProjectDoc = z.infer<typeof projectDocSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type TextOverlayClip = z.infer<typeof textOverlayClipSchema>;
