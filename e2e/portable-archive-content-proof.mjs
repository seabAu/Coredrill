import { expect } from "@playwright/test";

/** All canonical records/columns/metadata, CSV bytes and content-addressed attachments. */
export const expectRestoredPortableContent = (actual, expected, openedBetween) => {
  expect(actual.manifest.vault).toEqual(expected.manifest.vault);
  const json = (archive) =>
    JSON.parse(
      new TextDecoder().decode(
        archive.dataFiles.find(({ path }) => path === "data/vault.json").bytes,
      ),
    );
  const originalVault = json(expected).rows[0];
  const openedVault = json(actual).rows[0];
  // The normal root's accepted OpenVault command deliberately touches this one field.
  // Require its bounded new instant; no career/application/content timestamp is excluded.
  expect(Date.parse(openedVault.last_opened_at)).toBeGreaterThanOrEqual(openedBetween[0]);
  expect(Date.parse(openedVault.last_opened_at)).toBeLessThanOrEqual(openedBetween[1]);
  expect(Date.parse(openedVault.last_opened_at)).toBeGreaterThanOrEqual(
    Date.parse(originalVault.last_opened_at),
  );
  expect(actual.dataFiles.map(({ path }) => path)).toEqual(
    expected.dataFiles.map(({ path }) => path),
  );
  for (const file of expected.dataFiles) {
    const restored = actual.dataFiles.find(({ path }) => path === file.path);
    if (file.format === "json") {
      const originalData = JSON.parse(new TextDecoder().decode(file.bytes));
      const restoredData = JSON.parse(new TextDecoder().decode(restored.bytes));
      // A new export has a new generation instant; no stored field is normalized away.
      expect(originalData.generatedAt).toBe(expected.manifest.createdAt);
      expect(restoredData.generatedAt).toBe(actual.manifest.createdAt);
      const expectedData =
        file.path === "data/vault.json"
          ? {
              ...originalData,
              rows: originalData.rows.map((row) => ({
                ...row,
                last_opened_at: openedVault.last_opened_at,
              })),
            }
          : originalData;
      expect({ ...restoredData, generatedAt: originalData.generatedAt }, file.path).toEqual(
        expectedData,
      );
    } else if (file.path === "data/vault.csv") {
      const originalCsv = new TextDecoder().decode(file.bytes);
      const index = originalCsv.lastIndexOf(originalVault.last_opened_at);
      expect(index).toBeGreaterThan(0);
      const expectedCsv =
        originalCsv.slice(0, index) +
        openedVault.last_opened_at +
        originalCsv.slice(index + originalVault.last_opened_at.length);
      expect(new TextDecoder().decode(restored.bytes)).toBe(expectedCsv);
    } else
      expect(Buffer.from(restored.bytes).equals(Buffer.from(file.bytes)), file.path).toBe(true);
  }
  expect(actual.attachments.map(({ contentId }) => contentId)).toEqual(
    expected.attachments.map(({ contentId }) => contentId),
  );
  for (const original of expected.attachments) {
    const restored = actual.attachments.find(({ contentId }) => contentId === original.contentId);
    expect(
      Buffer.from(restored.bytes).equals(Buffer.from(original.bytes)),
      original.contentId,
    ).toBe(true);
  }
};
