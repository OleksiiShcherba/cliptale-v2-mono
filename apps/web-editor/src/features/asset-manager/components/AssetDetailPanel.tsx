/**
 * Re-export from the canonical shared location.
 *
 * `AssetDetailPanel` was moved to `shared/asset-detail/` because it now
 * serves both the asset-manager feature (project context) and the
 * generate-wizard feature (draft context). Per the feature-vs-shared rule,
 * cross-feature components live in `shared/`.
 *
 * Consumers inside `features/asset-manager/` that already import from this
 * path continue to work without change. New consumers (e.g. generate-wizard)
 * should import directly from `@/shared/asset-detail/AssetDetailPanel`.
 */
export {
  AssetDetailPanel,
  type AssetDetailPanelProps,
  type AssetDetailPanelContext,
} from '@/shared/asset-detail/AssetDetailPanel';
