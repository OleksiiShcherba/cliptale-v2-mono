/** Shared interfaces for AI generation provider adapters. */

/** Options accepted by image generation adapters. */
export type ImageGenerationOptions = {
  prompt: string;
  size?: string;
  style?: string;
  negativePrompt?: string;
};

/** Result returned by image generation adapters after S3 upload. */
export type ImageGenerationResult = {
  imageUrl: string;
  width: number;
  height: number;
  provider: string;
  model: string;
};

/** Options accepted by video generation adapters. */
export type VideoGenerationOptions = {
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  imageUrl?: string;
};

/** Result returned by video generation adapters. */
export type VideoGenerationResult = {
  videoUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  provider: string;
  model: string;
};

/** Options accepted by audio generation adapters. */
export type AudioGenerationOptions = {
  prompt: string;
  type: 'music' | 'sfx' | 'voice';
  duration?: number;
  voiceId?: string;
};

/** Result returned by audio generation adapters. */
export type AudioGenerationResult = {
  audioUrl: string;
  durationSeconds: number;
  provider: string;
  model: string;
};

/** Common dependencies injected into adapter functions. */
export type AdapterDeps = {
  s3: import('@aws-sdk/client-s3').S3Client;
  bucket: string;
  projectId: string;
};

/** Unified adapter function signature for image generation. */
export type ImageAdapter = (
  apiKey: string,
  options: ImageGenerationOptions,
  deps: AdapterDeps,
) => Promise<ImageGenerationResult>;

/** Unified adapter function signature for video generation. */
export type VideoAdapter = (
  apiKey: string,
  options: VideoGenerationOptions,
  deps: AdapterDeps,
) => Promise<VideoGenerationResult>;

/** Unified adapter function signature for audio generation. */
export type AudioAdapter = (
  apiKey: string,
  options: AudioGenerationOptions,
  deps: AdapterDeps,
) => Promise<AudioGenerationResult>;
