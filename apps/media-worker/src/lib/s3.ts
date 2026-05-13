import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from '@/config.js';
import { parseStorageUri } from '@/lib/storage-uri.js';

type SignedReadUrlClient = Pick<S3Client, 'config' | 'middlewareStack' | 'send'>;
type SignReadObjectUrl = (
  client: SignedReadUrlClient,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

const signReadObjectUrl = getSignedUrl as unknown as SignReadObjectUrl;

/** Singleton S3Client for the media-worker, configured from app config. */
export const s3Client = new S3Client({
  region: config.s3.region,
  ...(config.s3.endpoint ? { endpoint: config.s3.endpoint, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

/** Short-lived GET URL TTL for OpenAI media context inputs. */
export const OPENAI_MEDIA_CONTEXT_URL_TTL_SECONDS = 60 * 30;

/**
 * Creates a short-lived signed GET URL from a durable storage URI.
 * Storyboard planning calls this immediately before the OpenAI request so URLs
 * are fresh and never need to be persisted in job rows.
 */
export async function getSignedReadUrl(
  storageUri: string,
  s3: S3Client = s3Client,
): Promise<string> {
  const { bucket, key } = parseStorageUri(storageUri);
  return signReadObjectUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: OPENAI_MEDIA_CONTEXT_URL_TTL_SECONDS,
  });
}
