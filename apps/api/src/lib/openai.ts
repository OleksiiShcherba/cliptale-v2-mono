import OpenAI from 'openai';

import { config } from '@/config.js';

/**
 * Singleton OpenAI client configured from `config.openai.apiKey`.
 * Import this — never instantiate `OpenAI` elsewhere in the API app.
 *
 * The authoring model id lives in `config.openai.model` (default `gpt-4o`,
 * ADR-0002 revised) — pass it to requests; do not hard-code a model.
 *
 * An empty key fallback keeps the client constructible when no key is present
 * (e.g. test mode); requests fail only if actually issued without a real key.
 */
export const openai = new OpenAI({
  apiKey: config.openai.apiKey || 'test-mode-no-key',
});
