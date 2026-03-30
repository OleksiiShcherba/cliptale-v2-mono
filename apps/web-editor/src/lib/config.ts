/** Central env var access — the ONLY file allowed to read import.meta.env in apps/web-editor. */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string ?? 'http://localhost:3001',
} as const;
