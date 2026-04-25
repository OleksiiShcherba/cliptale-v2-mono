import { z } from 'zod';

export const trackSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['video', 'audio', 'caption', 'overlay']),
  name: z.string(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
});
