import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getSignedReadUrl, OPENAI_MEDIA_CONTEXT_URL_TTL_SECONDS } from './s3.js';

vi.mock('@/config.js', () => ({
  config: {
    s3: {
      region: 'auto',
      endpoint: 'https://r2.example.com',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
    },
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example.com/object'),
}));

describe('s3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs s3 durable storage URIs as GetObject requests with the OpenAI media TTL', async () => {
    const s3 = new S3Client({ region: 'us-east-1' });

    await expect(getSignedReadUrl('s3://media-bucket/images/product.png', s3)).resolves.toBe(
      'https://signed.example.com/object',
    );

    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [client, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(client).toBe(s3);
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: 'media-bucket',
      Key: 'images/product.png',
    });
    expect(options).toEqual({ expiresIn: OPENAI_MEDIA_CONTEXT_URL_TTL_SECONDS });
    expect(OPENAI_MEDIA_CONTEXT_URL_TTL_SECONDS).toBe(60 * 30);
  });

  it('signs r2 durable storage URIs as GetObject requests with the OpenAI media TTL', async () => {
    const s3 = new S3Client({ region: 'auto' });

    await getSignedReadUrl('r2://media-bucket/thumbnails/demo.jpg', s3);

    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: 'media-bucket',
      Key: 'thumbnails/demo.jpg',
    });
    expect(options).toEqual({ expiresIn: 60 * 30 });
  });
});
