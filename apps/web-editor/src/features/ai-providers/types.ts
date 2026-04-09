/** Valid AI provider identifiers — must match backend enum exactly. */
export type AiProvider =
  | 'openai'
  | 'runway'
  | 'stability_ai'
  | 'elevenlabs'
  | 'kling'
  | 'pika'
  | 'suno'
  | 'replicate';

/** AI generation type categories. */
export type AiGenerationType = 'image' | 'video' | 'audio' | 'text';

/** Provider summary as returned by GET /user/ai-providers. */
export type ProviderSummary = {
  provider: AiProvider;
  isActive: boolean;
  isConfigured: boolean;
  createdAt: string;
};

/** Static display metadata for a provider — used in the UI catalog. */
export type ProviderInfo = {
  provider: AiProvider;
  name: string;
  description: string;
  supportedTypes: AiGenerationType[];
};

/** Full catalog of all supported providers with display info. */
export const PROVIDER_CATALOG: ProviderInfo[] = [
  {
    provider: 'openai',
    name: 'OpenAI',
    description: 'GPT image generation and text completion',
    supportedTypes: ['image', 'text'],
  },
  {
    provider: 'stability_ai',
    name: 'Stability AI',
    description: 'Stable Diffusion image generation',
    supportedTypes: ['image'],
  },
  {
    provider: 'replicate',
    name: 'Replicate',
    description: 'Open-source model hosting for image generation',
    supportedTypes: ['image'],
  },
  {
    provider: 'runway',
    name: 'Runway',
    description: 'AI video generation and editing',
    supportedTypes: ['video'],
  },
  {
    provider: 'kling',
    name: 'Kling',
    description: 'AI-powered video generation',
    supportedTypes: ['video'],
  },
  {
    provider: 'pika',
    name: 'Pika',
    description: 'Creative AI video generation',
    supportedTypes: ['video'],
  },
  {
    provider: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'AI voice synthesis and audio generation',
    supportedTypes: ['audio'],
  },
  {
    provider: 'suno',
    name: 'Suno',
    description: 'AI music and sound effect generation',
    supportedTypes: ['audio'],
  },
];
