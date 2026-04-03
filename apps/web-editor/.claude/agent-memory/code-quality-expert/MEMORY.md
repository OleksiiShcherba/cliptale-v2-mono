# Code Quality Expert — Memory Index

- [api-client is a fetch wrapper, not generated client](project_api_client_pattern.md) — The codebase uses a hand-rolled fetch wrapper in lib/api-client.ts; the api-contracts generated client is not yet wired in; do not flag this as a violation
- [useAssetPolling uses manual setInterval, not React Query](project_asset_polling_pattern.md) — asset-manager polling predates the React Query adoption; useTranscriptionStatus correctly uses React Query; both patterns coexist
- [Frame math in useAddCaptionsToTimeline hook](project_frame_math_in_hooks.md) — segment→clip frame conversion lives in the hook intentionally; editor-core is an empty stub; do not flag as §5 violation
