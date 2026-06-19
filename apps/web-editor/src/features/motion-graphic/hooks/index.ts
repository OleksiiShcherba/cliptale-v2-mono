/**
 * Hooks for the motion-graphic feature.
 *
 * Barrel — the list/query hook (T13) lives here; the authoring-chat hooks (T14)
 * land here too. Kept as an explicit module so imports resolve from a stable
 * path while the slice is built out.
 */

export {
  useMotionGraphicsList,
  MOTION_GRAPHICS_QUERY_KEY,
  type UseMotionGraphicsListResult,
} from './useMotionGraphicsList';
