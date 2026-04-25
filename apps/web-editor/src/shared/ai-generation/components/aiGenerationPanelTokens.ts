/**
 * Dark-theme color tokens for the AI Generation panel.
 *
 * Extracted from `aiGenerationPanelStyles.ts` so multiple style files
 * (the main styles barrel and `aiGenerationFieldStyles.ts`) can share
 * the same token set without circular imports, while keeping every
 * file under the §9.7 300-line cap.
 */

/** Panel background — deepest surface of the dark theme. */
export const SURFACE_ALT = '#16161F';

/** Elevated surface used for inputs, cards, and secondary buttons. */
export const SURFACE_ELEVATED = '#1E1E2E';

/** Brand primary — selected states, accents, CTAs. */
export const PRIMARY = '#7C3AED';

/** Darker shade of PRIMARY — reserved for hover/pressed variants. */
export const PRIMARY_DARK = '#5B21B6';

/** Main body text color. */
export const TEXT_PRIMARY = '#F0F0FA';

/** Secondary / helper text color. */
export const TEXT_SECONDARY = '#8A8AA0';

/** 1px border color for cards, inputs, and dividers. */
export const BORDER = '#252535';

/** Success state (generation complete). */
export const SUCCESS = '#10B981';

/** Error state (failed jobs, required-field markers, inline errors). */
export const ERROR = '#EF4444';
