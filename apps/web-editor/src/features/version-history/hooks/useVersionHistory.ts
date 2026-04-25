import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { listVersions, restoreVersion } from '@/features/version-history/api';
import { setProject, setCurrentVersionId } from '@/store/project-store';
import type { VersionSummary } from '@/features/version-history/api';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const versionHistoryKeys = {
  list: (projectId: string) => ['version-history', projectId] as const,
};

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export type UseVersionHistoryResult = {
  versions: VersionSummary[];
  isLoading: boolean;
  isError: boolean;
  restoreToVersion: (versionId: number) => Promise<void>;
  isRestoring: boolean;
};

// ---------------------------------------------------------------------------
// useVersionHistory
// ---------------------------------------------------------------------------

/**
 * Fetches the last 50 versions for the current project and exposes a
 * `restoreToVersion` callback that calls the restore endpoint, updates the
 * project store with the returned doc, and invalidates the version list.
 */
export function useVersionHistory(projectId: string): UseVersionHistoryResult {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: versionHistoryKeys.list(projectId),
    queryFn: () => listVersions(projectId),
    staleTime: 30_000,
  });

  const [isRestoring, setIsRestoring] = useState(false);

  const restoreToVersion = useCallback(
    async (versionId: number): Promise<void> => {
      setIsRestoring(true);
      try {
        const response = await restoreVersion(projectId, versionId);
        setProject(response.docJson);
        setCurrentVersionId(versionId);
        await queryClient.invalidateQueries({
          queryKey: versionHistoryKeys.list(projectId),
        });
      } finally {
        setIsRestoring(false);
      }
    },
    [queryClient, projectId],
  );

  return {
    versions: data ?? [],
    isLoading,
    isError,
    restoreToVersion,
    isRestoring,
  };
}
