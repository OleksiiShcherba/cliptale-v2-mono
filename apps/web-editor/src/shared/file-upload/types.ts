/** Where the uploaded file will be linked after finalization. */
export type UploadTarget =
  | { kind: 'project'; projectId: string }
  | { kind: 'draft'; draftId: string };

/** Per-file upload state tracked by useFileUpload. */
export type UploadEntry = {
  file: File;
  /** File ID returned by POST /files/upload-url. */
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
  /** 0–100 upload progress percentage driven by XHR onprogress events. */
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
};
