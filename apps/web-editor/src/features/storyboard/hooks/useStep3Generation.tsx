import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { startStoryboardVideos } from '@/features/storyboard/api';
import { Step3GenerationModal } from '@/features/storyboard/components/Step3GenerationModal';

type Step3GenerationState = {
  openStep3Modal: () => void;
  step3Modal: React.ReactElement | null;
};

export function useStep3Generation(draftId: string): Step3GenerationState {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const openStep3Modal = useCallback((): void => {
    setError(null);
    setIsOpen(true);
  }, []);

  const handleSkip = useCallback((): void => {
    navigate(`/generate/road-map?draftId=${encodeURIComponent(draftId)}&mode=images`);
  }, [draftId, navigate]);

  const handleGenerate = useCallback(
    async (params: { modelId: string; generateAudio: boolean }): Promise<void> => {
      if (!draftId || isBusy) return;
      setIsBusy(true);
      setError(null);
      try {
        await startStoryboardVideos(draftId, params);
        navigate(`/generate/road-map?draftId=${encodeURIComponent(draftId)}&mode=videos`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to start storyboard videos.');
      } finally {
        setIsBusy(false);
      }
    },
    [draftId, isBusy, navigate],
  );

  const step3Modal = isOpen ? (
    <Step3GenerationModal
      isBusy={isBusy}
      error={error}
      onClose={() => {
        if (!isBusy) setIsOpen(false);
      }}
      onSkip={handleSkip}
      onGenerate={handleGenerate}
    />
  ) : null;

  return { openStep3Modal, step3Modal };
}
