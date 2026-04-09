import { useState, useCallback } from 'react';

import { submitGeneration } from '@/features/ai-generation/api';
import type { AiGenerationRequest, AiGenerationJob } from '@/features/ai-generation/types';

import { useJobPolling } from './useJobPolling';

/** Return type for the useAiGeneration hook. */
export type UseAiGenerationResult = {
  /** Submit a generation request. Starts polling automatically. */
  submit: (projectId: string, request: AiGenerationRequest) => Promise<void>;
  /** Latest job state from polling, or null when idle. */
  currentJob: AiGenerationJob | null;
  /** Whether a generation is in progress (submitting or polling). */
  isGenerating: boolean;
  /** Error from the most recent submit or polling failure. */
  error: string | null;
  /** Reset to idle state so the user can generate again. */
  reset: () => void;
};

/**
 * Manages the full AI generation lifecycle: submit, poll, track state, and reset.
 *
 * Calls `submitGeneration` to create a job, then delegates to `useJobPolling`
 * for real-time status updates. Returns the current job, loading state, and error.
 */
export function useAiGeneration(): UseAiGenerationResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { job, isPolling } = useJobPolling(jobId);

  const submit = useCallback(
    async (projectId: string, request: AiGenerationRequest): Promise<void> => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await submitGeneration(projectId, request);
        setJobId(result.jobId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit generation');
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setJobId(null);
    setError(null);
    setIsSubmitting(false);
  }, []);

  const isGenerating = isSubmitting || isPolling;

  return { submit, currentJob: job, isGenerating, error, reset };
}
