import { DocumentImportError } from "./import-types.js";

export const DOCX_ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 2_048,
  maxEntryNameBytes: 512,
  maxExpandedBytes: 32 * 1024 * 1024,
  maxExpandedEntryBytes: 16 * 1024 * 1024,
});

export interface DocxArchivePreflight {
  readonly entryCount: number;
  readonly expandedBytes: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_U16 = 0xffff;
const ZIP64_U32 = 0xffffffff;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const ENCRYPTED_FLAG = 0x0001;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UTF8_FLAG = 0x0800;
const REVIEWED_FLAG_MASK = DATA_DESCRIPTOR_FLAG | UTF8_FLAG;
const SUPPORTED_COMPRESSION_METHODS = new Set([0, 8]);
const REQUIRED_DOCX_ENTRIES = new Set(["[content_types].xml", "word/document.xml"]);

const corrupt = (): never => {
  throw new DocumentImportError("corrupt_file");
};

const tooComplex = (): never => {
  throw new DocumentImportError("too_complex");
};

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const readU16 = (view: DataView, offset: number): number => {
  if (offset < 0 || offset + 2 > view.byteLength) return corrupt();
  return view.getUint16(offset, true);
};

const readU32 = (view: DataView, offset: number): number => {
  if (offset < 0 || offset + 4 > view.byteLength) return corrupt();
  return view.getUint32(offset, true);
};

const findEndOfCentralDirectory = (view: DataView): number => {
  if (view.byteLength < 22) return corrupt();
  const minimum = Math.max(0, view.byteLength - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readU32(view, offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = readU16(view, offset + 20);
    if (offset + 22 + commentLength === view.byteLength) return offset;
  }
  return corrupt();
};

const decodeEntryName = (bytes: Uint8Array, utf8: boolean): string => {
  if (bytes.byteLength < 1 || bytes.byteLength > DOCX_ARCHIVE_LIMITS.maxEntryNameBytes) {
    return corrupt();
  }
  if (!utf8 && bytes.some((byte) => byte > 0x7f)) return corrupt();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return corrupt();
  }
};

const checkedEntryName = (value: string): string => {
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/iu.test(value)
  ) {
    return corrupt();
  }
  const path = value.endsWith("/") ? value.slice(0, -1) : value;
  const segments = path.split("/");
  if (
    path.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return corrupt();
  }
  return value;
};

export const preflightDocxArchive = (bytes: Uint8Array): DocxArchivePreflight => {
  const view = viewOf(bytes);
  const endOffset = findEndOfCentralDirectory(view);
  const diskNumber = readU16(view, endOffset + 4);
  const centralDirectoryDisk = readU16(view, endOffset + 6);
  const entriesOnDisk = readU16(view, endOffset + 8);
  const entryCount = readU16(view, endOffset + 10);
  const centralDirectoryBytes = readU32(view, endOffset + 12);
  const centralDirectoryOffset = readU32(view, endOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0 ||
    entryCount === ZIP64_U16 ||
    centralDirectoryBytes === ZIP64_U32 ||
    centralDirectoryOffset === ZIP64_U32 ||
    centralDirectoryOffset + centralDirectoryBytes !== endOffset
  ) {
    return corrupt();
  }
  if (entryCount > DOCX_ARCHIVE_LIMITS.maxEntries) return tooComplex();

  const seenNames = new Set<string>();
  let cursor = centralDirectoryOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, cursor) !== CENTRAL_DIRECTORY_ENTRY) return corrupt();
    const flags = readU16(view, cursor + 8);
    const compressionMethod = readU16(view, cursor + 10);
    const compressedBytes = readU32(view, cursor + 20);
    const expandedEntryBytes = readU32(view, cursor + 24);
    const nameBytes = readU16(view, cursor + 28);
    const extraBytes = readU16(view, cursor + 30);
    const commentBytes = readU16(view, cursor + 32);
    const entryDisk = readU16(view, cursor + 34);
    const localHeaderOffset = readU32(view, cursor + 42);
    const recordBytes = 46 + nameBytes + extraBytes + commentBytes;
    if (
      cursor + recordBytes > endOffset ||
      entryDisk !== 0 ||
      (flags & ENCRYPTED_FLAG) !== 0 ||
      !SUPPORTED_COMPRESSION_METHODS.has(compressionMethod) ||
      (compressionMethod === 0 && compressedBytes !== expandedEntryBytes) ||
      compressedBytes === ZIP64_U32 ||
      expandedEntryBytes === ZIP64_U32 ||
      localHeaderOffset === ZIP64_U32
    ) {
      return corrupt();
    }
    if (expandedEntryBytes > DOCX_ARCHIVE_LIMITS.maxExpandedEntryBytes) return tooComplex();
    expandedBytes += expandedEntryBytes;
    if (
      !Number.isSafeInteger(expandedBytes) ||
      expandedBytes > DOCX_ARCHIVE_LIMITS.maxExpandedBytes
    ) {
      return tooComplex();
    }

    const centralName = checkedEntryName(
      decodeEntryName(
        bytes.subarray(cursor + 46, cursor + 46 + nameBytes),
        (flags & UTF8_FLAG) !== 0,
      ),
    );
    const normalizedName = centralName.toLocaleLowerCase("en-US");
    if (seenNames.has(normalizedName)) return corrupt();
    seenNames.add(normalizedName);

    if (
      localHeaderOffset + 30 > centralDirectoryOffset ||
      readU32(view, localHeaderOffset) !== LOCAL_FILE_HEADER
    ) {
      return corrupt();
    }
    const localFlags = readU16(view, localHeaderOffset + 6);
    const localCompressionMethod = readU16(view, localHeaderOffset + 8);
    const localCompressedBytes = readU32(view, localHeaderOffset + 18);
    const localExpandedBytes = readU32(view, localHeaderOffset + 22);
    const localNameBytes = readU16(view, localHeaderOffset + 26);
    const localExtraBytes = readU16(view, localHeaderOffset + 28);
    const localDataOffset = localHeaderOffset + 30 + localNameBytes + localExtraBytes;
    if (
      (localFlags & ENCRYPTED_FLAG) !== 0 ||
      (localFlags & REVIEWED_FLAG_MASK) !== (flags & REVIEWED_FLAG_MASK) ||
      localCompressionMethod !== compressionMethod ||
      localDataOffset + compressedBytes > centralDirectoryOffset
    ) {
      return corrupt();
    }
    const localName = checkedEntryName(
      decodeEntryName(
        bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameBytes),
        (localFlags & UTF8_FLAG) !== 0,
      ),
    );
    if (localName !== centralName) return corrupt();
    if (
      (localFlags & DATA_DESCRIPTOR_FLAG) === 0 &&
      (localCompressedBytes !== compressedBytes || localExpandedBytes !== expandedEntryBytes)
    ) {
      return corrupt();
    }
    cursor += recordBytes;
  }
  if (cursor !== endOffset) return corrupt();
  if ([...REQUIRED_DOCX_ENTRIES].some((name) => !seenNames.has(name))) return corrupt();
  return Object.freeze({ entryCount, expandedBytes });
};
