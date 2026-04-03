---
name: useAssetPolling uses manual setInterval, not React Query
description: asset-manager polling hook uses setInterval + useEffect; new hooks (useTranscriptionStatus) correctly use React Query — both coexist
type: project
---

`features/asset-manager/hooks/useAssetPolling.ts` uses a manual `setInterval` + `useEffect` pattern for polling, not React Query. This predates the React Query adoption for server state. The newer `useTranscriptionStatus` hook correctly uses React Query `useQuery` with `refetchInterval`.

**Why:** The asset-manager was likely written before React Query was adopted as the standard for server state. Both patterns currently exist in the codebase.

**How to apply:** Do not flag `useAssetPolling` for not using React Query — it is legacy. For any NEW polling hook, React Query with `refetchInterval` is the correct pattern (as established by `useTranscriptionStatus`).
