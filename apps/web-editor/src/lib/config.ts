import { z } from 'zod';

const envSchema = z.object({
  VITE_PUBLIC_API_BASE_URL: z.string().url(),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  throw new Error(
    'Missing required environment variables: ' + JSON.stringify(parsed.error.format()),
  );
}

const env = parsed.data;

/** Central env var access — the ONLY file allowed to read import.meta.env in apps/web-editor. */
export const config = {
  apiBaseUrl: env.VITE_PUBLIC_API_BASE_URL,
} as const;
