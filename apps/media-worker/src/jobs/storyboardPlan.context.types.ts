import type { PromptDoc } from '@ai-video-editor/project-schema';

export type FileStatus = 'pending' | 'processing' | 'ready' | 'error';
export type MediaContextKind = 'image' | 'audio' | 'video';

export type StoryboardPlanMediaContextItem = {
  fileId: string;
  mediaType: MediaContextKind;
  label: string;
  mimeType: string | null;
  displayName: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bytes: number | null;
  status: FileStatus;
  thumbnailAvailable: boolean;
  storageUri: string;
  thumbnailUri: string | null;
  transcript: string | null;
  contextStrategy: 'image-vision' | 'audio-transcript-first' | 'video-metadata-thumbnail-transcript';
};

export type StoryboardPlanOpenAiMediaInput = {
  fileId: string;
  mediaType: MediaContextKind;
  label: string;
  role: 'image' | 'thumbnail' | 'video-preview';
  url: string;
  mimeType: string | null;
};

export type StoryboardPlanResolvedContext = {
  promptDoc: PromptDoc;
  text: string;
  media: StoryboardPlanMediaContextItem[];
  openAiMediaInputs: StoryboardPlanOpenAiMediaInput[];
};
