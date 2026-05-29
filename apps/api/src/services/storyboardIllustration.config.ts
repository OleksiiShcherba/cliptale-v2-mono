import type { DraftAspectRatio } from '@ai-video-editor/project-schema';

export const STORYBOARD_ILLUSTRATION_MODEL_ID = 'openai/gpt-image-2';
export const STORYBOARD_OPENAI_IMAGE_MODEL_ID = 'gpt-image-2';
export const STORYBOARD_ILLUSTRATION_QUALITY = 'low';

export function getOpenAIImageSize(
  aspectRatio: DraftAspectRatio,
): '1536x1024' | '1024x1536' | '1024x1024' {
  if (aspectRatio === '9:16') return '1024x1536';
  if (aspectRatio === '1:1') return '1024x1024';
  return '1536x1024';
}

export function buildStoryboardIllustrationOptions(params: {
  prompt: string;
  aspectRatio: DraftAspectRatio;
}): Record<string, unknown> {
  const imageSizeByAspect: Record<DraftAspectRatio, string> = {
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '1:1': 'square',
  };

  return {
    prompt: params.prompt,
    image_size: imageSizeByAspect[params.aspectRatio],
    quality: STORYBOARD_ILLUSTRATION_QUALITY,
    num_images: 1,
    output_format: 'png',
    sync_mode: false,
  };
}
