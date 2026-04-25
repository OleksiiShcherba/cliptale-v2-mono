/**
 * @deprecated Use `useFileUpload` from `@/shared/file-upload/useFileUpload` directly.
 *
 * This shim preserves backward compatibility for callers that still pass `{ projectId }`.
 * It converts the old project-scoped signature to the shared hook's `UploadTarget` shape.
 * New callers and the wizard should import `useFileUpload` directly.
 */
import { useFileUpload, type UseFileUploadResult } from '@/shared/file-upload/useFileUpload';

type UseAssetUploadOptions = {
  projectId: string;
  onUploadComplete?: (fileId: string) => void;
};

export function useAssetUpload({ projectId, onUploadComplete }: UseAssetUploadOptions): UseFileUploadResult {
  return useFileUpload({
    target: { kind: 'project', projectId },
    onUploadComplete,
  });
}
