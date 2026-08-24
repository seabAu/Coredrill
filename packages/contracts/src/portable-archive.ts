import * as z from "zod";

import {
  instantSchema,
  safeIdentifierSchema,
  semanticVersionSchema,
  sha256Schema,
  uuidV7Schema,
} from "./primitives.js";

export const PORTABLE_ARCHIVE_MANIFEST_SPEC_VERSION = 1 as const;
export const PORTABLE_ARCHIVE_MANIFEST_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/portable-archive-manifest/v1.json" as const;

export const PORTABLE_ARCHIVE_LIMITS = Object.freeze({
  maxAttachments: 10_000,
  maxDataFiles: 128,
  maxMigrationHistory: 10_000,
  maxPathCharacters: 1024,
});

const portableArchivePathSchema = z
  .string()
  .max(PORTABLE_ARCHIVE_LIMITS.maxPathCharacters)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/);
const mediaTypeSchema = z
  .string()
  .max(255)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/);
const byteLengthSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const archiveEntryBaseV1Schema = z.strictObject({
  path: portableArchivePathSchema,
  mediaType: mediaTypeSchema,
  byteLength: byteLengthSchema,
  sha256: sha256Schema,
});

export const portableDatabaseEntryV1Schema = archiveEntryBaseV1Schema.extend({
  kind: z.literal("database"),
  path: z.literal("database.sqlite3"),
  mediaType: z.literal("application/vnd.sqlite3"),
});

export const portableDataEntryV1Schema = archiveEntryBaseV1Schema.extend({
  kind: z.literal("data"),
  format: z.enum(["json", "csv"]),
  logicalName: safeIdentifierSchema,
});

export const portableAttachmentEntryV1Schema = archiveEntryBaseV1Schema.extend({
  kind: z.literal("attachment"),
  contentId: sha256Schema,
  logicalName: z.string().min(1).max(255).optional(),
});

export const migrationHistoryEntryV1Schema = z.strictObject({
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: safeIdentifierSchema,
  appliedAt: instantSchema,
  sha256: sha256Schema,
});

export const portableArchiveManifestV1Schema = z
  .strictObject({
    specVersion: z.literal(PORTABLE_ARCHIVE_MANIFEST_SPEC_VERSION),
    archiveId: uuidV7Schema,
    createdAt: instantSchema,
    createdBy: z.strictObject({
      name: z.literal("coredrill"),
      version: semanticVersionSchema,
    }),
    vault: z.strictObject({
      id: uuidV7Schema,
      schemaVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      migrationHistory: z
        .array(migrationHistoryEntryV1Schema)
        .max(PORTABLE_ARCHIVE_LIMITS.maxMigrationHistory),
    }),
    checksumAlgorithm: z.literal("sha256"),
    database: portableDatabaseEntryV1Schema,
    dataFiles: z.array(portableDataEntryV1Schema).max(PORTABLE_ARCHIVE_LIMITS.maxDataFiles),
    attachments: z
      .array(portableAttachmentEntryV1Schema)
      .max(PORTABLE_ARCHIVE_LIMITS.maxAttachments),
    encryption: z.strictObject({
      specVersion: z.literal(1),
      mode: z.literal("none"),
    }),
  })
  .superRefine((manifest, context) => {
    const allPaths = [
      manifest.database.path,
      ...manifest.dataFiles.map((entry) => entry.path),
      ...manifest.attachments.map((entry) => entry.path),
    ];
    if (new Set(allPaths).size !== allPaths.length) {
      context.addIssue({
        code: "custom",
        message: "Archive entry paths must be unique.",
        path: ["dataFiles"],
      });
    }

    const contentIds = manifest.attachments.map((entry) => entry.contentId);
    if (new Set(contentIds).size !== contentIds.length) {
      context.addIssue({
        code: "custom",
        message: "Attachment content IDs must be unique.",
        path: ["attachments"],
      });
    }

    for (const [index, attachment] of manifest.attachments.entries()) {
      if (attachment.contentId !== attachment.sha256) {
        context.addIssue({
          code: "custom",
          message: "Attachment content ID must equal its SHA-256 checksum.",
          path: ["attachments", index, "contentId"],
        });
      }
    }

    const migrationVersions = manifest.vault.migrationHistory.map((entry) => entry.version);
    const strictlyIncreasing = migrationVersions.every(
      (version, index) => index === 0 || version > (migrationVersions[index - 1] ?? -1),
    );
    if (!strictlyIncreasing) {
      context.addIssue({
        code: "custom",
        message: "Migration history versions must be strictly increasing.",
        path: ["vault", "migrationHistory"],
      });
    }

    const lastMigrationVersion = migrationVersions.at(-1) ?? 0;
    if (lastMigrationVersion !== manifest.vault.schemaVersion) {
      context.addIssue({
        code: "custom",
        message: "Vault schema version must equal the last migration version, or zero when empty.",
        path: ["vault", "schemaVersion"],
      });
    }
  })
  .meta({
    title: "Coredrill PortableArchiveManifestV1",
    description:
      "Checksummed inventory for a portable local vault archive containing its database, human-readable data, attachments, migration history, and explicit encryption state.",
  });

const generatedPortableArchiveManifestV1JsonSchema = z.toJSONSchema(
  portableArchiveManifestV1Schema,
  { target: "draft-2020-12" },
);
const { $schema: portableArchiveDialect, ...portableArchiveSchemaBody } =
  generatedPortableArchiveManifestV1JsonSchema;

export const portableArchiveManifestV1JsonSchema = Object.freeze({
  $schema: portableArchiveDialect,
  $id: PORTABLE_ARCHIVE_MANIFEST_V1_SCHEMA_ID,
  ...portableArchiveSchemaBody,
});

export type PortableDatabaseEntryV1 = z.infer<typeof portableDatabaseEntryV1Schema>;
export type PortableDataEntryV1 = z.infer<typeof portableDataEntryV1Schema>;
export type PortableAttachmentEntryV1 = z.infer<typeof portableAttachmentEntryV1Schema>;
export type MigrationHistoryEntryV1 = z.infer<typeof migrationHistoryEntryV1Schema>;
export type PortableArchiveManifestV1 = z.infer<typeof portableArchiveManifestV1Schema>;
