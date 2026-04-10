/**
 * fal.ai model catalog for the unified AI generation layer.
 *
 * This module exposes the static, compile-time list of every fal.ai model the
 * ClipTale editor supports, alongside the per-field schema the UI and API use to
 * render forms and validate requests. The catalog is a leaf module: plain
 * TypeScript, zero runtime dependencies, no network access required to consume it.
 *
 * Key facts:
 *  - Schemas were captured from the fal.ai MCP (`mcp__fal-ai__get_model_schema`)
 *    on 2026-04-09. Any field edits here should be re-verified against a fresh
 *    MCP query for that specific model.
 *  - Audio generation models are in `elevenlabs-models.ts`; the combined
 *    `AI_MODELS` catalog is re-exported from `index.ts`.
 *  - The `fal-ai/kling-video/o3/standard/image-to-video` entry exposes both
 *    `prompt` and `multi_prompt`; exactly one of those must be supplied. The XOR
 *    is enforced at runtime by the API service (Epic 9 / Ticket 5), NOT by this
 *    schema.
 *  - Runtime validation (Zod) lives at the API boundary. This module does not
 *    import Zod; Ticket 5 translates `FalInputSchema` into a Zod validator on
 *    the fly.
 *
 * Exports:
 *  - `FAL_MODELS`     — the catalog const (`readonly FalModel[]`, length 9)
 *  - `FalModel`       — single catalog entry type
 *  - `FalCapability`  — union of the 4 supported capability values
 *  - `FalFieldType`   — union of the 10 supported field types (incl. audio_url, audio_upload)
 *  - `FalFieldSchema` — per-field descriptor (name, type, default, enum, etc.)
 *  - `FalInputSchema` — wrapper around a model's field list
 *  - `AiProvider`     — discriminator: 'fal' | 'elevenlabs'
 */

/** Discriminates which external provider handles a given model. */
export type AiProvider = 'fal' | 'elevenlabs';

export type FalCapability =
  | 'text_to_image'
  | 'image_edit'
  | 'text_to_video'
  | 'image_to_video';

/** Top-level media-kind grouping for the AI Generation panel. */
export type AiGroup = 'images' | 'videos' | 'audio';

/** Maps each fal.ai capability to its parent group. Audio group is declared
 *  but empty until Phase 2 (ElevenLabs) lands. */
export const CAPABILITY_TO_GROUP: Readonly<Record<FalCapability, AiGroup>> = {
  text_to_image: 'images',
  image_edit: 'images',
  text_to_video: 'videos',
  image_to_video: 'videos',
};

export type FalFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'image_url'
  | 'image_url_list'
  | 'string_list'
  | 'audio_url'
  | 'audio_upload';

export type FalFieldSchema = {
  name: string;
  type: FalFieldType;
  label: string;
  required: boolean;
  description?: string;
  default?: string | number | boolean | string[];
  enum?: readonly string[];
  min?: number;
  max?: number;
};

export type FalInputSchema = {
  fields: readonly FalFieldSchema[];
};

export type FalModel = {
  id: string;
  provider: 'fal';
  capability: FalCapability;
  group: 'images' | 'videos';
  label: string;
  description: string;
  inputSchema: FalInputSchema;
};

export const FAL_MODELS: readonly FalModel[] = [
  // 1. fal-ai/ltx-2-19b/image-to-video
  {
    id: 'fal-ai/ltx-2-19b/image-to-video',
    provider: 'fal',
    capability: 'image_to_video',
    group: 'videos',
    label: 'LTX-2 Image to Video',
    description:
      'High-fidelity image-to-video with end-frame interpolation, camera LoRA, and audio generation.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'The prompt used for the generation.',
        },
        {
          name: 'image_url',
          type: 'image_url',
          label: 'Image URL',
          required: true,
          description: 'URL of the image to generate the video from.',
        },
        {
          name: 'end_image_url',
          type: 'image_url',
          label: 'End Image URL',
          required: false,
          description: 'URL of the image to use as the end of the video.',
        },
        {
          name: 'generate_audio',
          type: 'boolean',
          label: 'Generate Audio',
          required: false,
          default: true,
          description: 'Whether to generate audio for the video.',
        },
        {
          name: 'video_quality',
          type: 'enum',
          label: 'Video Quality',
          required: false,
          default: 'high',
          enum: ['low', 'medium', 'high', 'maximum'],
          description: 'Quality of generated video.',
        },
        {
          name: 'end_image_strength',
          type: 'number',
          label: 'End Image Strength',
          required: false,
          default: 1,
          description: 'Strength of the end image.',
        },
        {
          name: 'fps',
          type: 'number',
          label: 'FPS',
          required: false,
          default: 25,
          description: 'Frames per second.',
        },
        {
          name: 'image_strength',
          type: 'number',
          label: 'Image Strength',
          required: false,
          default: 1,
          description: 'Strength of the input image.',
        },
        {
          name: 'use_multiscale',
          type: 'boolean',
          label: 'Use Multiscale',
          required: false,
          default: true,
          description: 'Multi-scale generation for better coherence.',
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          label: 'Number of Inference Steps',
          required: false,
          default: 40,
          description: 'Inference steps.',
        },
        {
          name: 'camera_lora',
          type: 'enum',
          label: 'Camera LoRA',
          required: false,
          default: 'none',
          enum: [
            'dolly_in',
            'dolly_out',
            'dolly_left',
            'dolly_right',
            'jib_up',
            'jib_down',
            'static',
            'none',
          ],
          description: 'Camera movement LoRA.',
        },
        {
          name: 'camera_lora_scale',
          type: 'number',
          label: 'Camera LoRA Scale',
          required: false,
          default: 1,
          description: 'Scale of camera LoRA.',
        },
        {
          name: 'seed',
          type: 'number',
          label: 'Seed',
          required: false,
          description: 'Random seed.',
        },
        {
          name: 'num_frames',
          type: 'number',
          label: 'Number of Frames',
          required: false,
          default: 121,
          description: 'Number of frames to generate.',
        },
        {
          name: 'sync_mode',
          type: 'boolean',
          label: 'Sync Mode',
          required: false,
          default: false,
          description: 'Return as data URI.',
        },
        {
          name: 'negative_prompt',
          type: 'text',
          label: 'Negative Prompt',
          required: false,
          description:
            'Negative prompt. Model ships with a long verbose default; omit to use the fal.ai-provided default.',
        },
        {
          name: 'enable_safety_checker',
          type: 'boolean',
          label: 'Enable Safety Checker',
          required: false,
          default: true,
          description: 'Safety checker.',
        },
        {
          name: 'video_output_type',
          type: 'enum',
          label: 'Video Output Type',
          required: false,
          default: 'X264 (.mp4)',
          enum: [
            'X264 (.mp4)',
            'VP9 (.webm)',
            'PRORES4444 (.mov)',
            'GIF (.gif)',
          ],
          description: 'Output container/codec.',
        },
        {
          name: 'video_write_mode',
          type: 'enum',
          label: 'Video Write Mode',
          required: false,
          default: 'balanced',
          enum: ['fast', 'balanced', 'small'],
          description: 'Write mode.',
        },
        {
          name: 'guidance_scale',
          type: 'number',
          label: 'Guidance Scale',
          required: false,
          default: 3,
          description: 'Guidance scale.',
        },
        {
          name: 'enable_prompt_expansion',
          type: 'boolean',
          label: 'Enable Prompt Expansion',
          required: false,
          default: true,
          description: 'Prompt expansion.',
        },
        {
          name: 'interpolation_direction',
          type: 'enum',
          label: 'Interpolation Direction',
          required: false,
          default: 'forward',
          enum: ['forward', 'backward'],
          description: 'Interpolation direction when using end image.',
        },
        {
          name: 'acceleration',
          type: 'enum',
          label: 'Acceleration',
          required: false,
          default: 'regular',
          enum: ['none', 'regular', 'high', 'full'],
          description: 'Acceleration level.',
        },
      ],
    },
  },

  // 2. fal-ai/kling-video/o3/standard/image-to-video
  {
    id: 'fal-ai/kling-video/o3/standard/image-to-video',
    provider: 'fal',
    capability: 'image_to_video',
    group: 'videos',
    label: 'Kling o3 Standard Image to Video',
    description:
      'Kling o3 image-to-video with multi-shot support. Provide either a single prompt or a multi_prompt list, not both.',
    inputSchema: {
      fields: [
        {
          name: 'image_url',
          type: 'image_url',
          label: 'Image URL',
          required: true,
          description: 'URL of the start frame image.',
        },
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: false,
          description:
            'Text prompt. Mutually exclusive with multi_prompt — provide exactly one (enforced at submit time).',
        },
        {
          name: 'end_image_url',
          type: 'image_url',
          label: 'End Image URL',
          required: false,
          description: 'URL of end frame image.',
        },
        {
          name: 'generate_audio',
          type: 'boolean',
          label: 'Generate Audio',
          required: false,
          default: false,
          description: 'Native audio generation.',
        },
        {
          name: 'shot_type',
          type: 'string',
          label: 'Shot Type',
          required: false,
          default: 'customize',
          description: 'Multi-shot generation type.',
        },
        {
          name: 'multi_prompt',
          type: 'string_list',
          label: 'Multi Prompt',
          required: false,
          description:
            'List of prompts for multi-shot video generation. Mutually exclusive with prompt — provide exactly one (enforced at submit time).',
        },
        {
          name: 'duration',
          type: 'enum',
          label: 'Duration',
          required: false,
          default: '5',
          enum: [
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
            '10',
            '11',
            '12',
            '13',
            '14',
            '15',
          ],
          description: 'Video duration in seconds (stringified).',
        },
      ],
    },
  },

  // 3. fal-ai/pixverse/v6/image-to-video
  {
    id: 'fal-ai/pixverse/v6/image-to-video',
    provider: 'fal',
    capability: 'image_to_video',
    group: 'videos',
    label: 'PixVerse v6 Image to Video',
    description:
      'PixVerse v6 image-to-video with BGM/SFX audio and multi-clip generation.',
    inputSchema: {
      fields: [
        {
          name: 'image_url',
          type: 'image_url',
          label: 'Image URL',
          required: true,
          description: 'URL of the first frame.',
        },
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Prompt.',
        },
        {
          name: 'negative_prompt',
          type: 'text',
          label: 'Negative Prompt',
          required: false,
          default: '',
          description: 'Negative prompt.',
        },
        {
          name: 'generate_multi_clip_switch',
          type: 'boolean',
          label: 'Generate Multi Clip',
          required: false,
          default: false,
          description: 'Enable multi-clip generation.',
        },
        {
          name: 'style',
          type: 'string',
          label: 'Style',
          required: false,
          description: 'Style of generated video.',
        },
        {
          name: 'resolution',
          type: 'enum',
          label: 'Resolution',
          required: false,
          default: '720p',
          enum: ['360p', '540p', '720p', '1080p'],
          description: 'Output resolution.',
        },
        {
          name: 'thinking_type',
          type: 'enum',
          label: 'Thinking Type',
          required: false,
          enum: ['enabled', 'disabled', 'auto'],
          description: 'Prompt optimization mode.',
        },
        {
          name: 'duration',
          type: 'number',
          label: 'Duration',
          required: false,
          default: 5,
          min: 1,
          max: 15,
          description: 'Duration in seconds.',
        },
        {
          name: 'generate_audio_switch',
          type: 'boolean',
          label: 'Generate Audio',
          required: false,
          default: false,
          description: 'Enable audio generation (BGM, SFX, dialogue).',
        },
        {
          name: 'seed',
          type: 'number',
          label: 'Seed',
          required: false,
          description: 'Random seed.',
        },
      ],
    },
  },

  // 4. fal-ai/wan/v2.2-a14b/image-to-video
  {
    id: 'fal-ai/wan/v2.2-a14b/image-to-video',
    provider: 'fal',
    capability: 'image_to_video',
    group: 'videos',
    label: 'Wan 2.2 A14B Image to Video',
    description:
      'Wan 2.2 A14B image-to-video with two-stage guidance, frame interpolation, and per-stage safety checkers.',
    inputSchema: {
      fields: [
        {
          name: 'image_url',
          type: 'image_url',
          label: 'Image URL',
          required: true,
          description: 'Input image URL (center-cropped to aspect ratio).',
        },
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Text prompt.',
        },
        {
          name: 'end_image_url',
          type: 'image_url',
          label: 'End Image URL',
          required: false,
          description: 'URL of end image.',
        },
        {
          name: 'negative_prompt',
          type: 'text',
          label: 'Negative Prompt',
          required: false,
          default: '',
          description: 'Negative prompt.',
        },
        {
          name: 'guidance_scale',
          type: 'number',
          label: 'Guidance Scale',
          required: false,
          default: 3.5,
          description: 'CFG scale stage 1.',
        },
        {
          name: 'guidance_scale_2',
          type: 'number',
          label: 'Guidance Scale 2',
          required: false,
          default: 3.5,
          description: 'CFG scale stage 2.',
        },
        {
          name: 'shift',
          type: 'number',
          label: 'Shift',
          required: false,
          default: 5,
          min: 1.0,
          max: 10.0,
          description: 'Shift value.',
        },
        {
          name: 'num_frames',
          type: 'number',
          label: 'Number of Frames',
          required: false,
          default: 81,
          min: 17,
          max: 161,
          description: 'Frames to generate.',
        },
        {
          name: 'num_inference_steps',
          type: 'number',
          label: 'Number of Inference Steps',
          required: false,
          default: 27,
          description: 'Inference steps.',
        },
        {
          name: 'frames_per_second',
          type: 'number',
          label: 'Frames Per Second',
          required: false,
          default: 16,
          min: 4,
          max: 60,
          description: 'FPS.',
        },
        {
          name: 'num_interpolated_frames',
          type: 'number',
          label: 'Number of Interpolated Frames',
          required: false,
          default: 1,
          min: 0,
          max: 4,
          description: 'Frame interpolation count.',
        },
        {
          name: 'adjust_fps_for_interpolation',
          type: 'boolean',
          label: 'Adjust FPS for Interpolation',
          required: false,
          default: true,
          description: 'Auto-scale FPS by interpolation.',
        },
        {
          name: 'interpolator_model',
          type: 'enum',
          label: 'Interpolator Model',
          required: false,
          default: 'film',
          enum: ['none', 'film', 'rife'],
          description: 'Interpolation model.',
        },
        {
          name: 'resolution',
          type: 'enum',
          label: 'Resolution',
          required: false,
          default: '720p',
          enum: ['480p', '580p', '720p'],
          description: 'Output resolution.',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          label: 'Aspect Ratio',
          required: false,
          default: 'auto',
          enum: ['auto', '16:9', '9:16', '1:1'],
          description: 'Aspect ratio.',
        },
        {
          name: 'video_quality',
          type: 'enum',
          label: 'Video Quality',
          required: false,
          default: 'high',
          enum: ['low', 'medium', 'high', 'maximum'],
          description: 'Visual quality.',
        },
        {
          name: 'video_write_mode',
          type: 'enum',
          label: 'Video Write Mode',
          required: false,
          default: 'balanced',
          enum: ['fast', 'balanced', 'small'],
          description: 'Write mode.',
        },
        {
          name: 'acceleration',
          type: 'enum',
          label: 'Acceleration',
          required: false,
          default: 'regular',
          enum: ['none', 'regular'],
          description: 'Acceleration level.',
        },
        {
          name: 'enable_prompt_expansion',
          type: 'boolean',
          label: 'Enable Prompt Expansion',
          required: false,
          default: false,
          description: 'LLM prompt expansion.',
        },
        {
          name: 'enable_safety_checker',
          type: 'boolean',
          label: 'Enable Safety Checker',
          required: false,
          default: false,
          description: 'Input safety checker.',
        },
        {
          name: 'enable_output_safety_checker',
          type: 'boolean',
          label: 'Enable Output Safety Checker',
          required: false,
          default: false,
          description: 'Output safety checker.',
        },
        {
          name: 'seed',
          type: 'number',
          label: 'Seed',
          required: false,
          description: 'Random seed.',
        },
      ],
    },
  },

  // 5. fal-ai/kling-video/v2.5-turbo/pro/text-to-video
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    provider: 'fal',
    capability: 'text_to_video',
    group: 'videos',
    label: 'Kling 2.5 Turbo Pro Text to Video',
    description:
      'Kling 2.5 Turbo Pro text-to-video. Minimal controls; 5 or 10 second durations only.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Text prompt.',
        },
        {
          name: 'negative_prompt',
          type: 'text',
          label: 'Negative Prompt',
          required: false,
          default: 'blur, distort, and low quality',
          description: 'Negative prompt.',
        },
        {
          name: 'cfg_scale',
          type: 'number',
          label: 'CFG Scale',
          required: false,
          default: 0.5,
          description: 'Classifier-free guidance scale.',
        },
        {
          name: 'aspect_ratio',
          type: 'enum',
          label: 'Aspect Ratio',
          required: false,
          default: '16:9',
          enum: ['16:9', '9:16', '1:1'],
          description: 'Aspect ratio.',
        },
        {
          name: 'duration',
          type: 'enum',
          label: 'Duration',
          required: false,
          default: '5',
          enum: ['5', '10'],
          description: 'Video duration in seconds.',
        },
      ],
    },
  },

  // 6. fal-ai/nano-banana-2/edit
  {
    id: 'fal-ai/nano-banana-2/edit',
    provider: 'fal',
    capability: 'image_edit',
    group: 'images',
    label: 'Nano Banana 2 — Edit / Blend',
    description:
      'Multi-image edit and blend with adjustable thinking level, web search grounding, and extreme aspect ratios.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Prompt for image editing.',
        },
        {
          name: 'image_urls',
          type: 'image_url_list',
          label: 'Image URLs',
          required: true,
          description: 'URLs of input images.',
        },
        {
          name: 'num_images',
          type: 'number',
          label: 'Number of Images',
          required: false,
          default: 1,
          description: 'Number of images to generate.',
        },
        {
          name: 'limit_generations',
          type: 'boolean',
          label: 'Limit Generations',
          required: false,
          default: true,
          description: 'Cap to 1 generation per round; may affect quality.',
        },
        {
          name: 'resolution',
          type: 'enum',
          label: 'Resolution',
          required: false,
          default: '1K',
          enum: ['0.5K', '1K', '2K', '4K'],
          description: 'Output resolution.',
        },
        {
          name: 'aspect_ratio',
          type: 'string',
          label: 'Aspect Ratio',
          required: false,
          default: 'auto',
          description:
            'Free-string aspect; supports extreme ratios like 4:1, 1:4, 8:1, 1:8.',
        },
        {
          name: 'output_format',
          type: 'enum',
          label: 'Output Format',
          required: false,
          default: 'png',
          enum: ['jpeg', 'png', 'webp'],
          description: 'Output format.',
        },
        {
          name: 'thinking_level',
          type: 'enum',
          label: 'Thinking Level',
          required: false,
          enum: ['minimal', 'high'],
          description: 'Enable model thinking; omit to disable.',
        },
        {
          name: 'safety_tolerance',
          type: 'enum',
          label: 'Safety Tolerance',
          required: false,
          default: '4',
          enum: ['1', '2', '3', '4', '5', '6'],
          description: 'Content moderation strictness.',
        },
        {
          name: 'enable_web_search',
          type: 'boolean',
          label: 'Enable Web Search',
          required: false,
          default: false,
          description: 'Allow web search for up-to-date references.',
        },
        {
          name: 'seed',
          type: 'number',
          label: 'Seed',
          required: false,
          description: 'Random seed.',
        },
        {
          name: 'sync_mode',
          type: 'boolean',
          label: 'Sync Mode',
          required: false,
          default: false,
          description: 'Return as data URI.',
        },
      ],
    },
  },

  // 7. fal-ai/gpt-image-1.5/edit
  {
    id: 'fal-ai/gpt-image-1.5/edit',
    provider: 'fal',
    capability: 'image_edit',
    group: 'images',
    label: 'GPT Image 1.5 — Edit / Inpaint',
    description:
      'GPT Image 1.5 edit with optional mask for inpainting. Supports multiple reference images.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Prompt for image generation.',
        },
        {
          name: 'image_urls',
          type: 'image_url_list',
          label: 'Image URLs',
          required: true,
          description: 'Reference image URLs.',
        },
        {
          name: 'mask_image_url',
          type: 'image_url',
          label: 'Mask Image URL',
          required: false,
          description: 'Mask image indicating region to edit.',
        },
        {
          name: 'input_fidelity',
          type: 'enum',
          label: 'Input Fidelity',
          required: false,
          default: 'high',
          enum: ['low', 'high'],
          description: 'Input fidelity.',
        },
        {
          name: 'num_images',
          type: 'number',
          label: 'Number of Images',
          required: false,
          default: 1,
          description: 'Number of images.',
        },
        {
          name: 'image_size',
          type: 'enum',
          label: 'Image Size',
          required: false,
          default: 'auto',
          enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
          description: 'Aspect/size.',
        },
        {
          name: 'quality',
          type: 'enum',
          label: 'Quality',
          required: false,
          default: 'high',
          enum: ['low', 'medium', 'high'],
          description: 'Output quality.',
        },
        {
          name: 'output_format',
          type: 'enum',
          label: 'Output Format',
          required: false,
          default: 'png',
          enum: ['jpeg', 'png', 'webp'],
          description: 'Output format.',
        },
        {
          name: 'background',
          type: 'enum',
          label: 'Background',
          required: false,
          default: 'auto',
          enum: ['auto', 'transparent', 'opaque'],
          description: 'Background.',
        },
        {
          name: 'sync_mode',
          type: 'boolean',
          label: 'Sync Mode',
          required: false,
          default: false,
          description: 'Return as data URI.',
        },
      ],
    },
  },

  // 8. fal-ai/nano-banana-2
  {
    id: 'fal-ai/nano-banana-2',
    provider: 'fal',
    capability: 'text_to_image',
    group: 'images',
    label: 'Nano Banana 2 — Text to Image',
    description:
      'Nano Banana 2 text-to-image with extreme aspect ratios, multi-resolution output, and optional thinking level.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Text prompt.',
        },
        {
          name: 'num_images',
          type: 'number',
          label: 'Number of Images',
          required: false,
          default: 1,
          description: 'Number of images.',
        },
        {
          name: 'limit_generations',
          type: 'boolean',
          label: 'Limit Generations',
          required: false,
          default: true,
          description: 'Cap to 1 generation per prompt round.',
        },
        {
          name: 'resolution',
          type: 'enum',
          label: 'Resolution',
          required: false,
          default: '1K',
          enum: ['0.5K', '1K', '2K', '4K'],
          description: 'Output resolution.',
        },
        {
          name: 'aspect_ratio',
          type: 'string',
          label: 'Aspect Ratio',
          required: false,
          default: 'auto',
          description:
            'Free-string aspect; supports extreme ratios 4:1, 1:4, 8:1, 1:8.',
        },
        {
          name: 'output_format',
          type: 'enum',
          label: 'Output Format',
          required: false,
          default: 'png',
          enum: ['jpeg', 'png', 'webp'],
          description: 'Format.',
        },
        {
          name: 'thinking_level',
          type: 'enum',
          label: 'Thinking Level',
          required: false,
          enum: ['minimal', 'high'],
          description: 'Model thinking level; omit to disable.',
        },
        {
          name: 'safety_tolerance',
          type: 'enum',
          label: 'Safety Tolerance',
          required: false,
          default: '4',
          enum: ['1', '2', '3', '4', '5', '6'],
          description: 'Moderation strictness.',
        },
        {
          name: 'enable_web_search',
          type: 'boolean',
          label: 'Enable Web Search',
          required: false,
          default: false,
          description: 'Web search grounding.',
        },
        {
          name: 'seed',
          type: 'number',
          label: 'Seed',
          required: false,
          description: 'Random seed.',
        },
        {
          name: 'sync_mode',
          type: 'boolean',
          label: 'Sync Mode',
          required: false,
          default: false,
          description: 'Return as data URI.',
        },
      ],
    },
  },

  // 9. fal-ai/gpt-image-1.5
  {
    id: 'fal-ai/gpt-image-1.5',
    provider: 'fal',
    capability: 'text_to_image',
    group: 'images',
    label: 'GPT Image 1.5 — Text to Image',
    description:
      'GPT Image 1.5 text-to-image. Minimal control surface with fixed aspect ratio presets.',
    inputSchema: {
      fields: [
        {
          name: 'prompt',
          type: 'text',
          label: 'Prompt',
          required: true,
          description: 'Text prompt.',
        },
        {
          name: 'num_images',
          type: 'number',
          label: 'Number of Images',
          required: false,
          default: 1,
          description: 'Number of images.',
        },
        {
          name: 'image_size',
          type: 'enum',
          label: 'Image Size',
          required: false,
          default: '1024x1024',
          enum: ['1024x1024', '1536x1024', '1024x1536'],
          description: 'Size/aspect.',
        },
        {
          name: 'background',
          type: 'enum',
          label: 'Background',
          required: false,
          default: 'auto',
          enum: ['auto', 'transparent', 'opaque'],
          description: 'Background.',
        },
        {
          name: 'quality',
          type: 'enum',
          label: 'Quality',
          required: false,
          default: 'high',
          enum: ['low', 'medium', 'high'],
          description: 'Quality.',
        },
        {
          name: 'output_format',
          type: 'enum',
          label: 'Output Format',
          required: false,
          default: 'png',
          enum: ['jpeg', 'png', 'webp'],
          description: 'Output format.',
        },
        {
          name: 'sync_mode',
          type: 'boolean',
          label: 'Sync Mode',
          required: false,
          default: false,
          description: 'Return as data URI.',
        },
      ],
    },
  },
];
