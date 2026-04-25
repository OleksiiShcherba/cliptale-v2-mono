import { z } from 'zod';

import { clipSchema } from './clip.schema.js';
import { trackSchema } from './track.schema.js';

export const projectDocSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  title: z.string(),
  fps: z.number().positive().default(30),
  durationFrames: z.number().int().positive(),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  tracks: z.array(trackSchema),
  clips: z.array(clipSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
