/** AI generation content type categories. */
export type AiGenerationType = 'image' | 'video' | 'audio' | 'text';

/** Options specific to image generation. */
export type ImageGenOptions = {
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  style?: 'vivid' | 'natural';
  negativePrompt?: string;
};

/** Options specific to video generation. */
export type VideoGenOptions = {
  duration?: 3 | 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  imageUrl?: string;
};

/** Options specific to audio generation. */
export type AudioGenOptions = {
  duration?: number;
  type?: 'music' | 'sfx' | 'voice';
  voiceId?: string;
};

/** Union of all type-specific generation options. */
export type AiGenerationOptions = ImageGenOptions | VideoGenOptions | AudioGenOptions;

/** Request payload for POST /projects/:id/ai/generate. */
export type AiGenerationRequest = {
  type: AiGenerationType;
  prompt: string;
  options?: AiGenerationOptions;
  provider?: string;
};

/** Job status as returned by GET /ai/jobs/:jobId. */
export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/** AI generation job state returned by the polling endpoint. */
export type AiGenerationJob = {
  jobId: string;
  status: AiJobStatus;
  progress: number;
  resultAssetId: string | null;
  errorMessage: string | null;
};

/** Response from POST /projects/:id/ai/generate. */
export type AiGenerationSubmitResponse = {
  jobId: string;
  status: 'queued';
};
