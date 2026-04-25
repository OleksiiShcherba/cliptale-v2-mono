/**
 * React Query hook for the Storyboard panel.
 *
 * Fetches the authenticated user's storyboard card list from
 * GET /generation-drafts/cards.
 * Query key: ['home', 'storyboards'] — stable across re-renders.
 */

import { useQuery } from '@tanstack/react-query';

import { listStoryboardCards } from '../api';
import type { StoryboardCardSummary } from '../types';

type UseStoryboardCardsResult = {
  data: StoryboardCardSummary[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

/** Returns the storyboard card list for the current user. */
export function useStoryboardCards(): UseStoryboardCardsResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['home', 'storyboards'],
    queryFn: listStoryboardCards,
  });

  return { data, isLoading, isError };
}
