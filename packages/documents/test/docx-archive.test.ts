import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { DOCX_ARCHIVE_LIMITS, preflightDocxArchive } from "../src/docx-archive.js";

interface ZipEntryFixture {
  readonly data?: Uint8Array;
  readonly expandedBytes?: number;
  readonly flags?: number;
  readonly method?: 0 | 8;
  readonly name: string;
}

const writeU16 = (target: Uint8Array, offset: number, value: number): void => {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint16(offset, value, true);
};

const writeU32 = (target: Uint8Array, offset: number, value: number): void => {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, true);
};

const concatenate = (parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const zipFixture = (entries: readonly ZipEntryFixture[]): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data ?? Uint8Array.of(0x78);
    const method = entry.method ?? 0;
    const expandedBytes = entry.expandedBytes ?? data.byteLength;
    const flags = entry.flags ?? 0x0800;
    const local = new Uint8Array(30 + name.byteLength + data.byteLength);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, flags);
    writeU16(local, 8, method);
    writeU32(local, 18, data.byteLength);
    writeU32(local, 22, expandedBytes);
    writeU16(local, 26, name.byteLength);
    local.set(name, 30);
    local.set(data, 30 + name.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + name.byteLength);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU16(central, 8, flags);
    writeU16(central, 10, method);
    writeU32(central, 20, data.byteLength);
    writeU32(central, 24, expandedBytes);
    writeU16(central, 28, name.byteLength);
    writeU32(central, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength;
  }
  const locals = concatenate(localParts);
  const central = concatenate(centralParts);
  const end = new Uint8Array(22);
  writeU32(end, 0, 0x06054b50);
  writeU16(end, 8, entries.length);
  writeU16(end, 10, entries.length);
  writeU32(end, 12, central.byteLength);
  writeU32(end, 16, locals.byteLength);
  return concatenate([locals, central, end]);
};

const minimalEntries = (document: Partial<ZipEntryFixture> = {}): readonly ZipEntryFixture[] => [
  { name: "[Content_Types].xml", data: Uint8Array.of(0x3c) },
  { name: "word/document.xml", data: Uint8Array.of(0x3c), ...document },
];

describe("DOCX archive preflight", () => {
  it("accepts the synthetic product fixture and reports declared expansion", async () => {
    const fixture = new Uint8Array(
      await readFile(new URL("../../../fixtures/imports/synthetic-resume.docx", import.meta.url)),
    );
    const result = preflightDocxArchive(fixture);

    expect(result.entryCount).toBeGreaterThan(1);
    expect(result.entryCount).toBeLessThanOrEqual(DOCX_ARCHIVE_LIMITS.maxEntries);
    expect(result.expandedBytes).toBeGreaterThan(fixture.byteLength);
    expect(result.expandedBytes).toBeLessThanOrEqual(DOCX_ARCHIVE_LIMITS.maxExpandedBytes);
  });

  it("accepts a bounded canonical ZIP inventory", () => {
    expect(preflightDocxArchive(zipFixture(minimalEntries()))).toEqual({
      entryCount: 2,
      expandedBytes: 2,
    });
  });

  it("rejects declared expansion before decompression", () => {
    const archive = zipFixture(
      minimalEntries({
        method: 8,
        expandedBytes: DOCX_ARCHIVE_LIMITS.maxExpandedEntryBytes + 1,
      }),
    );

    expect(() => preflightDocxArchive(archive)).toThrow(
      "This document exceeds the safe local parser budget.",
    );
  });

  it("rejects encrypted, path-shaped, duplicate, and incomplete inventories", () => {
    expect(() => preflightDocxArchive(zipFixture(minimalEntries({ flags: 0x0801 })))).toThrow(
      "This file could not be read.",
    );
    expect(() =>
      preflightDocxArchive(
        zipFixture([{ name: "[Content_Types].xml" }, { name: "../word/document.xml" }]),
      ),
    ).toThrow("This file could not be read.");
    expect(() =>
      preflightDocxArchive(zipFixture([...minimalEntries(), { name: "WORD/DOCUMENT.XML" }])),
    ).toThrow("This file could not be read.");
    expect(() => preflightDocxArchive(zipFixture([{ name: "[Content_Types].xml" }]))).toThrow(
      "This file could not be read.",
    );
  });
});
