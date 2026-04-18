/**
 * Re-export from shared — the canonical implementation lives in
 * `shared/file-upload/UploadProgressList.tsx`.
 *
 * Existing callers in the asset-manager feature continue to work without
 * changing their import paths.
 */
export { UploadProgressList } from '@/shared/file-upload/UploadProgressList';
export type { UploadProgressListProps } from '@/shared/file-upload/UploadProgressList';
