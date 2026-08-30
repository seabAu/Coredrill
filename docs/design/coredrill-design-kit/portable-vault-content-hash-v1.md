# Portable vault content hash version 1

Status: Implemented baseline for `BKP-007`

## Purpose

The portable vault content hash proves that one validated archive and restored vaults in different storage adapters represent the same durable Phase 1 content. It is a deterministic comparison checksum, not encryption, authentication, or a substitute for archive and SQLite integrity validation.

A raw SQLite checksum cannot serve this purpose because a conforming adapter may rewrite page-layout details while reopening or exporting the same logical database. Raw database SHA-256 remains mandatory for archive-member validation and stale-target protection.

## Inputs

The version-1 content descriptor contains:

- the exact UUIDv7 vault identity;
- the positive SQLite schema version;
- one entry for every version-1 human-readable JSON data file; and
- one entry for every content-addressed attachment in `attachment_manifest`.

CSV files are deterministic human-readable mirrors and are excluded to avoid hashing the same projection twice. Raw SQLite bytes are excluded from this cross-adapter descriptor. Attachment metadata and relationships remain covered by the JSON projections, while every attachment entry independently covers its verified bytes.

The archive calculation accepts only an already validated `InspectedPortableArchiveV1`. The restored-vault calculation regenerates the 29 JSON projections with the archive's `generatedAt`, reads the canonical attachment inventory from SQLite, and requires every physical attachment to match its recorded byte length and lowercase SHA-256 content ID.

## Canonical descriptor

Entries are sorted first by `kind` and then by Unicode code-unit text order of `identity`. Each JSON data entry is:

```text
data:<archive-path>:<decimal-byte-length>:<lowercase-sha256>
```

Each attachment entry is:

```text
attachment:<content-id>:<decimal-byte-length>:<lowercase-sha256>
```

The UTF-8 SHA-256 preimage is the following newline-delimited text, including the final empty line:

```text
coredrill-vault-content-v1
vault:<vault-id>
schema:<decimal-schema-version>
<sorted descriptor entries>

```

The result contains `specVersion: 1`, the lowercase SHA-256, vault ID, schema version, JSON data-file count, and attachment count. Any invalid identity, count, checksum, missing attachment, attachment mismatch, projection failure, or checksum failure returns a stable typed error and no comparison result.

## Restore-target fingerprint

Preview staleness uses a separate adapter-neutral fingerprint over raw database state and the logical attachment inventory. Attachment IDs are unique lowercase SHA-256 values and sorted before hashing. The UTF-8 preimage, including its final empty line, is:

```text
coredrill-restore-target-v1
database:<database-sha256>
<sorted attachment content IDs>

```

This fingerprint is opaque in the public preview. Browser TypeScript and the thin Rust native boundary implement the same version-1 preimage; commit refuses any target fingerprint that differs from preview.

## Versioning

Changing included datasets, entry identity, ordering, serialization, or preimage text requires a new content-hash version. Schema evolution may change a version-1 result naturally because schema version and projected content are explicit inputs. Older hashes remain evidence for the exact archive and schema recorded by their recovery report.
