import { describe, expect, it, vi } from "vitest";

import { loadStoredRequirementSource } from "../../apps/web/src/job-requirement-source.ts";

const jobId = "0199a710-0000-7000-8000-000000000001";
const snapshotId = "0199a710-0000-7000-8000-000000000003";
const reader = (text, accepted = []) => ({
  query: vi.fn(async (statement) =>
    statement.sql.includes("SELECT source_snapshot.id")
      ? [{ id: snapshotId, raw_text: text }]
      : accepted.map((source_pointer) => ({ source_pointer })),
  ),
  execute: vi.fn(() => {
    throw new Error("Parsing must not write.");
  }),
});

describe("stored requirement source projection", () => {
  it("does not mislabel a storage read failure as a parser limit", async () => {
    const db = reader("Requirements\n- TypeScript");
    db.query.mockImplementationOnce(async () => [
      { id: snapshotId, raw_text: "Requirements\n- TypeScript" },
    ]);
    db.query.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(loadStoredRequirementSource(db, jobId)).rejects.toThrow("storage unavailable");
  });
  it("retains exact line coordinates, blank lines, Unicode, parser categories and immutable proposals without writes", async () => {
    const db = reader(
      "# Requirements\r\n\r\n  - Required: TypeScript 🛠  \r\nNice to have:\r\n- SQLite",
    );
    const result = await loadStoredRequirementSource(db, jobId);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0]).toMatchObject({
      category: "required",
      sourceCategory: "required",
      sourceExcerpt: "  - Required: TypeScript 🛠  ",
      sourcePointer: "/raw_text/lines/3",
      normalizedText: "TypeScript 🛠",
    });
    expect(result.proposals[1]).toMatchObject({
      category: "desired",
      sourcePointer: "/raw_text/lines/5",
    });
    expect(result.proposals[0]).not.toHaveProperty("provenanceId");
    expect(Object.isFrozen(result.proposals[0])).toBe(true);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("filters only accepted snapshot/line identities without rewriting pending proposal IDs", async () => {
    const text = "Requirements\n- TypeScript\n- SQLite";
    const before = await loadStoredRequirementSource(reader(text), jobId);
    const after = await loadStoredRequirementSource(
      reader(text, ["/raw_text/lines/2"]),
      jobId,
      snapshotId,
    );
    expect(after.proposals).toEqual([before.proposals[1]]);
  });

  it.each([
    "x".repeat(524_289),
    Array(514).fill("- TypeScript").join("\n"),
    `Requirements\n- ${"x".repeat(4_097)}`,
  ])("reports parser limits without losing the job or partially parsing", async (text) => {
    const db = reader(text);
    const result = await loadStoredRequirementSource(db, jobId);
    expect(result.proposals).toEqual([]);
    expect(result.notice).toContain("limits");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("reports absent retained text without manufacturing provenance or proposals", async () => {
    const db = { query: vi.fn(async () => []), execute: vi.fn() };
    expect(await loadStoredRequirementSource(db, jobId)).toMatchObject({
      snapshotId: null,
      proposals: [],
      notice: "No retained listing text is available to parse.",
    });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
