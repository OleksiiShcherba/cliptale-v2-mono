import Anthropic from '@anthropic-ai/sdk';

import { config } from '@/config.js';

/**
 * Singleton Anthropic client configured from `config.anthropic.apiKey`.
 * Import this — never instantiate `Anthropic` elsewhere in the API app.
 *
 * The authoring model id lives in `config.anthropic.model` (default
 * `claude-opus-4-8`, ADR-0002) — pass it to requests; do not hard-code a model.
 */
export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});
