/**
 * Re-export from shared — the canonical implementation lives in
 * `shared/file-upload/UploadDropzone.tsx`.
 *
 * Existing callers in the asset-manager feature continue to work without
 * changing their import paths.
 */
export { UploadDropzone } from '@/shared/file-upload/UploadDropzone';
export type { UploadDropzoneProps } from '@/shared/file-upload/UploadDropzone';
