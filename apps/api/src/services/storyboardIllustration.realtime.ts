import { publishStoryboardStatusUpdated } from '@/lib/realtimePublisher.js';
import type { StoryboardIllustrationStatusResponse } from '@/services/storyboardIllustration.types.js';

type PublishStoryboardIllustrationStatusParams = {
  userId: string;
  draftId: string;
  status: StoryboardIllustrationStatusResponse;
};

type PublishStoryboardIllustrationFailureParams = {
  userId: string;
  draftId: string;
  jobId: string;
  blockId?: string;
  errorMessage: string;
};

export async function publishStoryboardIllustrationStatus(
  params: PublishStoryboardIllustrationStatusParams,
): Promise<void> {
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: {
      resource: 'storyboardIllustrations',
      status: params.status,
    },
  });
}

export async function publishStoryboardIllustrationFailure(
  params: PublishStoryboardIllustrationFailureParams,
): Promise<void> {
  await publishStoryboardStatusUpdated({
    userId: params.userId,
    draftId: params.draftId,
    payload: {
      resource: 'storyboardIllustrations',
      jobId: params.jobId,
      ...(params.blockId ? { blockId: params.blockId } : {}),
      status: 'failed',
      errorMessage: params.errorMessage,
    },
  });
}
