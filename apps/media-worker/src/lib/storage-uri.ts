/** Parses bucket name and object key from a `s3://bucket/key` URI. */
export function parseStorageUri(storageUri: string): { bucket: string; key: string } {
  const withoutScheme = storageUri.replace(/^s3:\/\//, '');
  const slashIndex = withoutScheme.indexOf('/');
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}
