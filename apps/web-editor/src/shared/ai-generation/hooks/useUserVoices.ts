import { useQuery } from '@tanstack/react-query';

import { listUserVoices } from '@/shared/ai-generation/api';
import type { UserVoice } from '@/shared/ai-generation/types';

/** Return type for the useUserVoices hook. */
export type UseUserVoicesResult = {
  /** User's cloned voices, empty array while loading. */
  userVoices: UserVoice[];
  isLoading: boolean;
  isError: boolean;
};

/**
 * Fetches the current user's cloned voices from GET /ai/voices.
 * Results are cached by React Query under key `['user-voices']`.
 */
export function useUserVoices(): UseUserVoicesResult {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['user-voices'],
    queryFn: listUserVoices,
  });

  return { userVoices: data, isLoading, isError };
}
