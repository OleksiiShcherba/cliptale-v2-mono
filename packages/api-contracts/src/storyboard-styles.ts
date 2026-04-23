/**
 * Storyboard visual styles static catalog.
 *
 * This module exposes the compile-time list of visual styles available in the
 * storyboard Effects panel and scene modal. The catalog is a leaf module: plain
 * TypeScript, zero runtime dependencies, no network access required to consume it.
 *
 * Key facts:
 *  - This is a read-only preset catalog; it does not require a DB table.
 *  - Both the frontend Effects panel and the scene modal consume the same catalog
 *    by importing from this shared package, ensuring they stay in sync.
 *  - `previewColor` is a hex value rendered as a swatch thumbnail in the Effects
 *    panel UI; it is not a generated-video property.
 *
 * Exports:
 *  - `STORYBOARD_STYLES` — readonly array of `StoryboardStyle` objects
 *  - `StoryboardStyle`   — single catalog entry type
 */

/** A single visual style preset available in the storyboard Effects panel. */
export type StoryboardStyle = {
  /** Kebab-case slug uniquely identifying this style (e.g. "cyberpunk"). */
  id: string;
  /** Human-readable display name shown in the Effects panel. */
  label: string;
  /** Brief description of the visual aesthetic shown in the scene modal. */
  description: string;
  /**
   * Hex color used as a thumbnail swatch in the Effects panel.
   * Represents the dominant tone of the style; not a generation parameter.
   */
  previewColor: string;
};

/** Static catalog of all supported storyboard visual styles. */
export const STORYBOARD_STYLES: readonly StoryboardStyle[] = [
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description:
      'Neon-lit dystopian future with electric blues, magentas, and rain-soaked streets.',
    previewColor: '#00FFFF',
  },
  {
    id: 'cinematic-glow',
    label: 'Cinematic Glow',
    description:
      'Warm, hazy golden-hour photography with lens flares and shallow depth of field.',
    previewColor: '#F5A623',
  },
  {
    id: 'film-noir',
    label: 'Film Noir',
    description:
      'High-contrast black-and-white with deep shadows and stark pools of white light.',
    previewColor: '#2A2A2A',
  },
];
