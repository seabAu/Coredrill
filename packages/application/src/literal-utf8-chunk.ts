/** Shared bounded literal decoder: exact text, never markup/JSON interpretation. */
export const decodeLiteralUtf8Chunk = (
  bytes: unknown,
  byteLength: number,
  byteOffset: number,
  limitBytes: number,
): { readonly text: string; readonly bytesRead: number; readonly hasMore: boolean } => {
  if (
    byteOffset > byteLength ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength !== Math.min(limitBytes, byteLength - byteOffset)
  )
    throw new TypeError();
  const atEnd = byteOffset + bytes.byteLength === byteLength;
  // Streaming decode defers only an incomplete trailing scalar. ignoreBOM
  // preserves U+FEFF even at the start of a later bounded chunk.
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes, {
    stream: !atEnd,
  });
  const bytesRead = new TextEncoder().encode(text).byteLength;
  if (
    bytesRead > bytes.byteLength ||
    (atEnd && bytesRead !== bytes.byteLength) ||
    (!atEnd && bytesRead < 1)
  )
    throw new TypeError();
  return Object.freeze({ text, bytesRead, hasMore: byteOffset + bytesRead < byteLength });
};
