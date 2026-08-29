import { describe, expect, it } from "vitest";

import { portableDataExportV1JsonSchema, portableDataExportV1Schema } from "../src/index.js";

const fixture = {
  specVersion: 1,
  dataset: "job",
  generatedAt: "2026-08-29T22:30:00.000Z",
  vaultId: "0198e102-0000-7000-8000-000000000001",
  sourceSchemaVersion: 92,
  columns: ["id", "title", "remote_region_json"],
  rowCount: 1,
  rows: [
    {
      id: "0198e102-0000-7000-8000-000000000002",
      title: "Platform Engineer",
      remote_region_json: { countryCodes: ["US"] },
    },
  ],
  csv: {
    path: "data/job.csv",
    dialect: "rfc4180",
    charset: "utf-8",
    header: "present",
    formulaEscaping: "apostrophe-prefix",
    nullEncoding: "empty-unquoted",
  },
} as const;

describe("portable data export contract", () => {
  it("round-trips a complete version 1 dataset", () => {
    expect(portableDataExportV1Schema.parse(fixture)).toEqual(fixture);
  });

  it("publishes a stable Draft 2020-12 schema identity", () => {
    expect(portableDataExportV1JsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://schemas.coredrill.local/portable-data-export/v1.json",
      additionalProperties: false,
    });
  });

  it.each([
    { ...fixture, columns: ["id", "id", "remote_region_json"] },
    { ...fixture, rowCount: 2 },
    { ...fixture, rows: [{ ...fixture.rows[0], undeclared: true }] },
    { ...fixture, rows: [{ id: fixture.rows[0].id, title: fixture.rows[0].title }] },
    { ...fixture, csv: { ...fixture.csv, path: "../job.csv" } },
    { ...fixture, unknown: true },
  ])("rejects a drifted dataset envelope", (candidate) => {
    expect(portableDataExportV1Schema.safeParse(candidate).success).toBe(false);
  });
});
