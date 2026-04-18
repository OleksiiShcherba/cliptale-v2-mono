/**
 * React Query hook for the Projects panel.
 *
 * Fetches the authenticated user's project list from GET /projects.
 * Query key: ['home', 'projects'] — stable across re-renders.
 */

import { useQuery } from '@tanstack/react-query';

import { listProjects } from '../api';
import type { ProjectSummary } from '../types';

type UseProjectsResult = {
  data: ProjectSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

/** Returns the project list for the current user. */
export function useProjects(): UseProjectsResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', 'projects'],
    queryFn: listProjects,
  });

  return { data, isLoading, isError };
}
