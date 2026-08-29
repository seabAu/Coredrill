import * as z from "zod";

import {
  instantSchema,
  jsonValueSchema,
  safeIdentifierSchema,
  uuidV7Schema,
} from "./primitives.js";

export const PORTABLE_DATA_EXPORT_SPEC_VERSION = 1 as const;
export const PORTABLE_DATA_EXPORT_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/portable-data-export/v1.json" as const;

export const PORTABLE_DATA_EXPORT_LIMITS = Object.freeze({
  columnsPerDataset: 64,
  rowsPerDataset: 250_000,
});

const portableDataRowV1Schema = z.record(safeIdentifierSchema, jsonValueSchema);

export const portableDataExportV1Schema = z
  .strictObject({
    specVersion: z.literal(PORTABLE_DATA_EXPORT_SPEC_VERSION),
    dataset: safeIdentifierSchema,
    generatedAt: instantSchema,
    vaultId: uuidV7Schema,
    sourceSchemaVersion: z.number().int().positive(),
    columns: z
      .array(safeIdentifierSchema)
      .min(1)
      .max(PORTABLE_DATA_EXPORT_LIMITS.columnsPerDataset),
    rowCount: z.number().int().nonnegative().max(PORTABLE_DATA_EXPORT_LIMITS.rowsPerDataset),
    rows: z.array(portableDataRowV1Schema).max(PORTABLE_DATA_EXPORT_LIMITS.rowsPerDataset),
    csv: z.strictObject({
      path: z.string().regex(/^data\/[a-z][a-z0-9_]*\.csv$/),
      dialect: z.literal("rfc4180"),
      charset: z.literal("utf-8"),
      header: z.literal("present"),
      formulaEscaping: z.literal("apostrophe-prefix"),
      nullEncoding: z.literal("empty-unquoted"),
    }),
  })
  .superRefine((value, context) => {
    if (new Set(value.columns).size !== value.columns.length) {
      context.addIssue({
        code: "custom",
        message: "Dataset columns must be unique.",
        path: ["columns"],
      });
    }
    if (value.rowCount !== value.rows.length) {
      context.addIssue({
        code: "custom",
        message: "Dataset rowCount must equal the rows array length.",
        path: ["rowCount"],
      });
    }

    const expectedColumns = new Set(value.columns);
    value.rows.forEach((row, rowIndex) => {
      const actualColumns = Object.keys(row);
      if (
        actualColumns.length !== value.columns.length ||
        actualColumns.some((column) => !expectedColumns.has(column))
      ) {
        context.addIssue({
          code: "custom",
          message: "Every dataset row must contain exactly the declared columns.",
          path: ["rows", rowIndex],
        });
      }
    });
  })
  .meta({
    id: PORTABLE_DATA_EXPORT_V1_SCHEMA_ID,
    title: "Coredrill PortableDataExportV1",
    description: "One versioned human-readable Coredrill dataset with an exact paired CSV mapping.",
  });

export type PortableDataExportV1 = z.infer<typeof portableDataExportV1Schema>;
export type PortableDataRowV1 = z.infer<typeof portableDataRowV1Schema>;

const generatedPortableDataExportV1JsonSchema = z.toJSONSchema(portableDataExportV1Schema, {
  target: "draft-2020-12",
});

export const portableDataExportV1JsonSchema = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...generatedPortableDataExportV1JsonSchema,
  $id: PORTABLE_DATA_EXPORT_V1_SCHEMA_ID,
});
