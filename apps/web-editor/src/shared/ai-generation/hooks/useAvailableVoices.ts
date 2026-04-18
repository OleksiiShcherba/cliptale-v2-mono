import { useQuery } from '@tanstack/react-query';

import { listAvailableVoices } from '@/shared/ai-generation/api';
import type { ElevenLabsVoice } from '@/shared/ai-generation/types';

/** Return type for the useAvailableVoices hook. */
export type UseAvailableVoicesResult = {
  /** ElevenLabs library voices, empty array while loading. */
  libraryVoices: ElevenLabsVoice[];
  isLoading: boolean;
  isError: boolean;
};

/**
 * Fetches all available ElevenLabs library voices from GET /ai/voices/available.
 * Results are cached by React Query under key `['available-voices']`.
 */
export function useAvailableVoices(): UseAvailableVoicesResult {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['available-voices'],
    queryFn: listAvailableVoices,
  });

  return { libraryVoices: data, isLoading, isError };
}
