import type { JsonValue } from "@coredrill/contracts";
import { confidence, dateOnly, entityId, instant, webUrl } from "@coredrill/domain";
import {
  VaultLifecycleError,
  createJobSourceSnapshotQuery,
  createJobSourceContentQuery,
  type JobSourceContentCursor,
} from "@coredrill/application";
import { createJobSourceSnapshotRepository } from "./job-source-snapshot-repository.js";
import { createJobSourceContentRepository } from "./job-source-content-repository.js";
import { createDatabaseVaultBootstrapPort } from "./application-ports.js";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";
import { createDocumentRepositories } from "./document-repositories.js";
import { createPipelineRepositories } from "./pipeline-repositories.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import {
  TrackerRepositoryConflictError,
  createTrackerRepositories,
  replaceConfirmedFieldValue,
} from "./tracker-repositories.js";

export interface TrackerRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  vault: entityId("vault", "0198e102-0000-7000-8000-000000000001"),
  location: entityId("location", "0198e102-0000-7000-8000-000000000002"),
  company: entityId("company", "0198e102-0000-7000-8000-000000000003"),
  contact: entityId("contact", "0198e102-0000-7000-8000-000000000004"),
  job: entityId("job", "0198e102-0000-7000-8000-000000000005"),
  jobSource: entityId("job-source", "0198e102-0000-7000-8000-000000000006"),
  snapshot: entityId("source-snapshot", "0198e102-0000-7000-8000-000000000007"),
  provenance: entityId("provenance", "0198e102-0000-7000-8000-000000000008"),
  companyAlias: entityId("company-alias", "0198e102-0000-7000-8000-00000000000e"),
  contactPointProvenance: entityId(
    "contact-point-provenance",
    "0198e102-0000-7000-8000-000000000009",
  ),
  currentFieldValue: entityId("field-value", "0198e102-0000-7000-8000-00000000000a"),
  replacementFieldValue: entityId("field-value", "0198e102-0000-7000-8000-00000000000b"),
  firstConfirmation: entityId("field-confirmation", "0198e102-0000-7000-8000-00000000000c"),
  replacementConfirmation: entityId("field-confirmation", "0198e102-0000-7000-8000-00000000000d"),
  device: entityId("device", "0198e102-0000-7000-8000-00000000000f"),
  otherDevice: entityId("device", "0198e102-0000-7000-8000-000000000010"),
  status: entityId("status_definition", "0198e102-0000-7000-8000-000000000011"),
  application: entityId("application", "0198e102-0000-7000-8000-000000000012"),
  invalidApplication: entityId("application", "0198e102-0000-7000-8000-000000000013"),
  interaction: entityId("interaction", "0198e102-0000-7000-8000-000000000014"),
  statusEvent: entityId("status-event", "0198e102-0000-7000-8000-000000000015"),
  resumeDocument: entityId("document", "0198e102-0000-7000-8000-000000000016"),
  otherDocument: entityId("document", "0198e102-0000-7000-8000-000000000017"),
  resumeVersion: entityId("document-version", "0198e102-0000-7000-8000-000000000018"),
  otherVersion: entityId("document-version", "0198e102-0000-7000-8000-000000000019"),
  invalidVersion: entityId("document-version", "0198e102-0000-7000-8000-00000000001a"),
});

const CREATED_AT = instant("2026-08-25T12:00:00.000Z");
const UPDATED_AT = instant("2026-08-25T12:05:00.000Z");
const REPLACED_AT = instant("2026-08-25T12:10:00.000Z");
const CONTENT_HASH = "a".repeat(64);
const VALUE_HASH = "b".repeat(64);
const REPLACEMENT_HASH = "c".repeat(64);
const ATTACHMENT_HASH = "d".repeat(64);
const INVALID_VERSION_HASH = "e".repeat(64);
const SYNTHETIC_IR: JsonValue = {
  specVersion: 1,
  document: { type: "doc", content: [] },
};

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

async function verifySourceContent(
  database: DatabasePort,
  jobId: string,
  jobSourceId: string,
): Promise<void> {
  const snapshotId = entityId("source-snapshot", "0198e102-0000-7000-8000-000000000088");
  const emptyId = entityId("source-snapshot", "0198e102-0000-7000-8000-000000000089");
  const literal = "\uFEFFa\u0000é中🙂\r\n<script>neverExecute()</script>\uFEFF";
  const markup = "<img src=x onerror=neverExecute()>é🙂";
  const structured = JSON.stringify({ literal, markup });
  // Reader fixtures exercise schema-valid legacy values without relaxing current writer policy.
  for (const fixture of [
    { id: snapshotId, raw: literal, html: markup, json: structured, hash: "d".repeat(64) },
    { id: emptyId, raw: "", html: null, json: null, hash: "e".repeat(64) },
  ]) {
    await database.execute(
      sqlStatement(
        `INSERT INTO source_snapshot(id, job_source_id, captured_at, extractor_id, extractor_version, raw_text, sanitized_html, structured_json, content_hash, retention_class, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fixture.id,
          jobSourceId,
          CREATED_AT,
          "synthetic.content",
          "1.0.0",
          fixture.raw,
          fixture.html,
          fixture.json,
          fixture.hash,
          "capture_review",
          CREATED_AT,
        ],
      ),
    );
  }
  const context = {
    operationId: entityId("application-operation", "0198e102-0000-7000-8000-000000000090"),
    initiatedAt: UPDATED_AT,
  };
  const query = createJobSourceContentQuery(createJobSourceContentRepository(database));
  const canonical = async () =>
    JSON.stringify({
      snapshots: await database.query(sqlStatement("SELECT * FROM source_snapshot ORDER BY id")),
      sources: await database.query(sqlStatement("SELECT * FROM job_source ORDER BY id")),
      jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
      provenance: await database.query(sqlStatement("SELECT * FROM provenance ORDER BY id")),
      fields: await database.query(sqlStatement("SELECT * FROM field_value ORDER BY id")),
    });
  const before = await canonical();
  let firstTextCursor: JobSourceContentCursor | null = null;
  for (const [kind, expected] of [
    ["text", literal],
    ["markup", markup],
    ["structured", structured],
  ] as const) {
    let after: JobSourceContentCursor | null = null;
    let recovered = "";
    let consumed = 0;
    do {
      const result = await query.execute(
        { jobId, snapshotId, kind, limitBytes: 4, after },
        context,
      );
      if (!result.ok || result.value.text === null)
        throw new DatabaseContractViolation("Retained source chunk read failed.");
      const value = result.value;
      assertContract(
        value.byteOffset === consumed &&
          value.bytesRead <= 4 &&
          value.byteLength === new TextEncoder().encode(expected).byteLength &&
          value.jobSourceId === jobSourceId,
        "Source chunk byte/source scope changed.",
      );
      recovered += result.value.text;
      consumed += value.bytesRead;
      after = value.nextCursor;
      if (kind === "text" && firstTextCursor === null && after !== null) firstTextCursor = after;
    } while (after !== null);
    assertContract(
      recovered === expected && consumed === new TextEncoder().encode(expected).byteLength,
      "Source chunk round-trip lost BOM/NUL, Unicode or literal markup/structured text.",
    );
  }
  if (firstTextCursor === null)
    throw new DatabaseContractViolation("Source cursor fixture missing.");
  const empty = await query.execute({ jobId, snapshotId: emptyId, kind: "text" }, context);
  const absent = await query.execute({ jobId, snapshotId: emptyId, kind: "markup" }, context);
  assertContract(
    empty.ok &&
      empty.value.text === "" &&
      empty.value.byteLength === 0 &&
      !empty.value.hasMore &&
      absent.ok &&
      absent.value.text === null &&
      absent.value.byteLength === null,
    "Absent and empty retained content were conflated.",
  );
  for (const after of [
    { ...firstTextCursor, contentHash: "f".repeat(64) },
    { ...firstTextCursor, byteLength: firstTextCursor.byteLength + 1 },
    { ...firstTextCursor, byteOffset: 1 },
  ]) {
    const result = await query.execute({ jobId, snapshotId, kind: "text", after }, context);
    assertContract(
      !result.ok && result.error.code === "conflict",
      "Stale or mid-scalar source continuation was accepted.",
    );
  }
  const foreign = await query.execute(
    { jobId: IDS.job, snapshotId, kind: "text", includeArchived: true },
    context,
  );
  assertContract(
    !foreign.ok && foreign.error.code === "not_found",
    "Retained content leaked across jobs.",
  );
  assertContract(
    (await canonical()) === before,
    "Content reads mutated canonical source/job/provenance state.",
  );
  await database.execute(
    sqlStatement("UPDATE job SET archived_at = ?, updated_at = ? WHERE id = ?", [
      UPDATED_AT,
      UPDATED_AT,
      jobId,
    ]),
  );
  const archived = await query.execute({ jobId, snapshotId, kind: "text" }, context);
  const included = await query.execute(
    { jobId, snapshotId, kind: "text", includeArchived: true },
    context,
  );
  assertContract(
    !archived.ok && archived.error.code === "not_found" && included.ok,
    "Content archive scope was not enforced.",
  );
}

/** Identical source query assertions run in Node, browser OPFS and native SQLite. */
async function verifySourceSnapshotHistory(database: DatabasePort): Promise<void> {
  const repositories = createTrackerRepositories(database);
  const original = await repositories.provenance.findSnapshotById(IDS.snapshot);
  const job = await repositories.jobs.findById(IDS.job);
  if (original === undefined || job === undefined)
    throw new DatabaseContractViolation("Source fixture is unavailable.");
  const tiedId = entityId("source-snapshot", "0198e102-0000-7000-8000-000000000081");
  const lateId = entityId("source-snapshot", "0198e102-0000-7000-8000-000000000082");
  const emptyJobId = entityId("job", "0198e102-0000-7000-8000-000000000083");
  const foreignSourceId = entityId("job-source", "0198e102-0000-7000-8000-000000000084");
  const foreignSnapshotId = entityId("source-snapshot", "0198e102-0000-7000-8000-000000000085");
  await repositories.provenance.appendSnapshot({
    ...original,
    id: tiedId,
    contentHash: "b".repeat(64),
    rawText: "Another same-time synthetic capture",
  });
  await repositories.jobs.create({
    ...job,
    id: emptyJobId,
    title: "Empty retained source history",
  });
  const context = {
    operationId: entityId("application-operation", "0198e102-0000-7000-8000-000000000086"),
    initiatedAt: UPDATED_AT,
  };
  const query = createJobSourceSnapshotQuery(createJobSourceSnapshotRepository(database));
  const empty = await query.execute({ jobId: emptyJobId }, context);
  assertContract(
    empty.ok && empty.value.items.length === 0,
    "Existing empty source history was not distinct from missing job.",
  );
  const source = await repositories.jobSources.findById(IDS.jobSource);
  if (source === undefined) throw new DatabaseContractViolation("Source fixture missing.");
  await repositories.jobSources.create({
    ...source,
    id: foreignSourceId,
    jobId: emptyJobId,
    externalId: "other-synthetic-posting",
    canonicalUrl: webUrl("https://jobs.example.test/other-synthetic-posting"),
  });
  await repositories.provenance.appendSnapshot({
    ...original,
    id: foreignSnapshotId,
    jobSourceId: foreignSourceId,
  });
  const canonical = async () =>
    JSON.stringify({
      snapshots: await database.query(sqlStatement("SELECT * FROM source_snapshot ORDER BY id")),
      sources: await database.query(sqlStatement("SELECT * FROM job_source ORDER BY id")),
      jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
      provenance: await database.query(sqlStatement("SELECT * FROM provenance ORDER BY id")),
      fields: await database.query(sqlStatement("SELECT * FROM field_value ORDER BY id")),
    });
  const before = await canonical();
  const first = await query.execute({ jobId: IDS.job, limit: 1 }, context);
  if (!first.ok || first.value.nextCursor === null)
    throw new DatabaseContractViolation("Source history first page failed.");
  const metadata = first.value.items[0];
  assertContract(
    metadata?.id === IDS.snapshot &&
      metadata.contentHash === CONTENT_HASH &&
      metadata.extractorId === original.extractorId &&
      metadata.currentSource.id === IDS.jobSource &&
      metadata.currentSource.primary,
    "Exact source metadata or tie order changed.",
  );
  assertContract(
    !Object.hasOwn(metadata ?? {}, "rawText") && !Object.hasOwn(metadata ?? {}, "structuredData"),
    "Metadata page disclosed retained raw content.",
  );
  const second = await query.execute(
    { jobId: IDS.job, limit: 1, after: first.value.nextCursor },
    context,
  );
  assertContract(
    second.ok && second.value.items[0]?.id === tiedId && !second.value.hasMore,
    "Source keyset continuation leaked, skipped or duplicated a snapshot.",
  );
  assertContract(
    (await canonical()) === before,
    "Source read mutated canonical job/source/provenance state.",
  );
  // Newly appended historical captures must not enter the older page's creation ceiling.
  await repositories.provenance.appendSnapshot({
    ...original,
    id: lateId,
    contentHash: "c".repeat(64),
    rawText: "Later retained synthetic capture",
    createdAt: REPLACED_AT,
  });
  const stable = await query.execute(
    { jobId: IDS.job, limit: 50, after: first.value.nextCursor },
    { ...context, initiatedAt: REPLACED_AT },
  );
  assertContract(
    stable.ok &&
      stable.value.items.length === 1 &&
      stable.value.items[0]?.id === tiedId &&
      stable.value.asOf === UPDATED_AT,
    "A later append changed bounded snapshot membership.",
  );
  const fresh = await query.execute(
    { jobId: IDS.job, limit: 50 },
    { ...context, initiatedAt: REPLACED_AT },
  );
  assertContract(
    fresh.ok && fresh.value.items.length === 3,
    "Explicit source refresh did not include the newly retained snapshot.",
  );
  const forged = await query.execute(
    { jobId: IDS.job, after: { ...first.value.nextCursor, id: foreignSnapshotId } },
    context,
  );
  assertContract(
    !forged.ok && forged.error.code === "conflict",
    "Cross-job source anchor did not fail closed.",
  );
  const missing = await query.execute(
    {
      jobId: IDS.job,
      after: {
        ...first.value.nextCursor,
        id: entityId("source-snapshot", "0198e102-0000-7000-8000-000000000087"),
      },
    },
    context,
  );
  assertContract(
    !missing.ok && missing.error.code === "conflict",
    "Missing source anchor was accepted.",
  );
  await database.execute(
    sqlStatement("UPDATE job_source SET is_primary = 0 WHERE id = ?", [IDS.jobSource]),
  );
  const current = await query.execute({ jobId: IDS.job }, context);
  assertContract(
    current.ok && current.value.items.every((entry) => !entry.currentSource.primary),
    "Current source metadata was falsely frozen at a capture time.",
  );
  await database.execute(
    sqlStatement("UPDATE job SET archived_at = ?, updated_at = ? WHERE id = ?", [
      UPDATED_AT,
      UPDATED_AT,
      IDS.job,
    ]),
  );
  const archived = await query.execute({ jobId: IDS.job }, context);
  const included = await query.execute({ jobId: IDS.job, includeArchived: true }, context);
  assertContract(
    !archived.ok &&
      archived.error.code === "not_found" &&
      included.ok &&
      included.value.items.length === 2,
    "Source history archive scope was not enforced.",
  );
  await verifySourceContent(database, emptyJobId, foreignSourceId);
}

const expectRepositoryFailure = async (
  operation: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new DatabaseContractViolation(message);
};

const createSourceAggregate = async (database: DatabasePort): Promise<void> => {
  await database.transaction(async (transaction) => {
    const repositories = createTrackerRepositories(transaction);
    await repositories.locations.create({
      id: IDS.location,
      label: "Boston, Massachusetts, United States",
      addressLocality: "Boston",
      region: "MA",
      postalCode: null,
      countryCode: "US",
      latitude: 42.3601,
      longitude: -71.0589,
      precision: "locality",
      source: "user",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.companies.create({
      id: IDS.company,
      canonicalName: "Northstar Research'); DROP TABLE job; --",
      websiteUrl: webUrl("https://northstar.example/"),
      domain: "northstar.example",
      locationId: IDS.location,
      notes: "Synthetic company fixture.",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.contacts.create({
      id: IDS.contact,
      companyId: IDS.company,
      name: "Morgan Example",
      role: "Recruiting coordinator",
      email: "morgan@northstar.example",
      phone: null,
      publicProfileUrl: null,
      confidence: confidence(0.8),
      userConfirmed: false,
      notes: "Synthetic contact; no guessed fields.",
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.jobs.create({
      id: IDS.job,
      companyId: IDS.company,
      title: "Platform Engineer'); DROP TABLE company; --",
      normalizedTitle: "platform engineer",
      descriptionText: "Synthetic role description.",
      employmentType: "full_time",
      workplaceType: "hybrid",
      seniority: "mid",
      locationId: IDS.location,
      remoteRegion: { countries: ["US"] },
      datePosted: dateOnly("2026-08-20"),
      validThrough: dateOnly("2026-09-30"),
      currentStatusId: null,
      nextActionAt: null,
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.jobSources.create({
      id: IDS.jobSource,
      jobId: IDS.job,
      connectorId: "manual",
      externalId: "synthetic-001",
      canonicalUrl: webUrl("https://northstar.example/jobs/platform-engineer"),
      applyUrl: webUrl("https://northstar.example/apply/platform-engineer"),
      firstSeenAt: CREATED_AT,
      lastSeenAt: CREATED_AT,
      contentHash: CONTENT_HASH,
      primary: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    await repositories.provenance.appendSnapshot({
      id: IDS.snapshot,
      jobSourceId: IDS.jobSource,
      capturedAt: CREATED_AT,
      extractorId: "manual",
      extractorVersion: "1.0.0",
      rawText: "Platform Engineer at Northstar Research",
      sanitizedHtml: null,
      structuredData: { title: "Platform Engineer" },
      contentHash: CONTENT_HASH,
      retentionClass: "synthetic",
      createdAt: CREATED_AT,
    });
    await repositories.provenance.append({
      id: IDS.provenance,
      sourceSnapshotId: IDS.snapshot,
      extractionMethod: "user",
      sourcePointer: "manual.title",
      sourceExcerpt: "Platform Engineer",
      confidence: confidence(1),
      capturedAt: CREATED_AT,
      licenseNote: "Synthetic disposable fixture.",
      createdAt: CREATED_AT,
    });
    await repositories.companies.addAlias({
      id: IDS.companyAlias,
      companyId: IDS.company,
      alias: "Northstar",
      sourceProvenanceId: IDS.provenance,
      createdAt: CREATED_AT,
    });
    await repositories.contacts.linkProvenance({
      id: IDS.contactPointProvenance,
      contactId: IDS.contact,
      fieldName: "email",
      valueHash: VALUE_HASH,
      provenanceId: IDS.provenance,
      createdAt: CREATED_AT,
    });
  });
};

const appendFieldValues = async (database: DatabasePort): Promise<void> => {
  const repositories = createTrackerRepositories(database);
  await repositories.fieldValues.append({
    id: IDS.currentFieldValue,
    entityType: "job",
    entityId: IDS.job,
    fieldName: "title",
    normalizedValue: "Platform Engineer",
    rawValue: "Platform Engineer",
    provenanceId: IDS.provenance,
    userConfirmation: {
      id: IDS.firstConfirmation,
      confirmedAt: CREATED_AT,
      confirmedValueHash: VALUE_HASH,
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repositories.fieldValues.append({
    id: IDS.replacementFieldValue,
    entityType: "job",
    entityId: IDS.job,
    fieldName: "title",
    normalizedValue: "Senior Platform Engineer",
    rawValue: "Senior Platform Engineer",
    provenanceId: IDS.provenance,
    userConfirmation: null,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  });
};

export const createTrackerRepositoryContractSuite = (
  setup: TrackerRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.suiteName, [
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.migrateVaultSettings,
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createTrackerRepositories(database);
        const bootstrap = createDatabaseVaultBootstrapPort(database);
        assertContract(
          (await bootstrap.inspect()).vault === null,
          "Inspection invented a vault identity.",
        );
        await repositories.vaults.create({
          id: IDS.vault,
          name: "Synthetic local vault",
          schemaVersion: 1,
          createdAt: CREATED_AT,
          lastOpenedAt: CREATED_AT,
        });
        await repositories.settings.put({
          key: "pipeline.preferences",
          value: { density: "comfortable", visibleColumns: ["title", "company"] },
          updatedAt: CREATED_AT,
        });
        const updated = await repositories.settings.put({
          key: "pipeline.preferences",
          value: { density: "compact", visibleColumns: ["title", "company", "date_posted"] },
          updatedAt: UPDATED_AT,
        });
        await repositories.vaults.touch(IDS.vault, UPDATED_AT);

        const vault = await repositories.vaults.findById(IDS.vault);
        assertContract(vault?.lastOpenedAt === UPDATED_AT, "Vault touch did not persist.");
        assertContract(updated.rowVersion === 2, "Setting upsert did not advance row_version.");
        assertContract(
          JSON.stringify(updated.value) ===
            JSON.stringify({
              density: "compact",
              visibleColumns: ["title", "company", "date_posted"],
            }),
          "Setting JSON did not round-trip exactly.",
        );
        assertContract(
          (await repositories.settings.list()).length === 1,
          "Setting list did not return the persisted record.",
        );
        const beforeInspection = JSON.stringify(
          await database.query(sqlStatement("SELECT * FROM vault")),
        );
        assertContract(
          (await bootstrap.inspect()).vault?.name === "Synthetic local vault",
          "Inspection lost the stored name.",
        );
        assertContract(
          JSON.stringify(await database.query(sqlStatement("SELECT * FROM vault"))) ===
            beforeInspection,
          "Inspection wrote operational metadata.",
        );
        const opened = await bootstrap.open({ vaultId: IDS.vault, openedAt: REPLACED_AT });
        assertContract(
          opened.vault.schemaVersion === opened.diagnostics.schemaVersion &&
            opened.vault.createdAt === CREATED_AT &&
            opened.vault.name === "Synthetic local vault",
          "Opening an old identity changed user facts or failed to refresh operational schema metadata.",
        );
        const other = entityId("vault", "0198e102-0000-7000-8000-00000000001b");
        await expectRepositoryFailure(
          () =>
            bootstrap.create({ vaultId: other, name: "Do not replace", createdAt: REPLACED_AT }),
          (error) => error instanceof VaultLifecycleError && error.code === "already_exists",
          "Bootstrap created a second identity or replaced an existing name.",
        );
        const settingsBefore = JSON.stringify(await repositories.settings.list());
        // Owned isolated fixture only: race two first-use requests after removing its root.
        await database.execute(sqlStatement("DELETE FROM vault"));
        const race = await Promise.allSettled([
          bootstrap.create({ vaultId: IDS.vault, name: "Concurrent A", createdAt: REPLACED_AT }),
          bootstrap.create({ vaultId: other, name: "Concurrent B", createdAt: REPLACED_AT }),
        ]);
        assertContract(
          race.filter((result) => result.status === "fulfilled").length === 1,
          "Concurrent bootstrap did not establish exactly one acknowledged identity.",
        );
        assertContract(
          (await database.query(sqlStatement("SELECT id FROM vault"))).length === 1,
          "Concurrent initialization persisted more than one root.",
        );
        const current = (await bootstrap.inspect()).vault;
        assertContract(current !== null, "Concurrent initialization lost its acknowledged root.");
        await repositories.vaults.create({
          id: entityId("vault", "0198e102-0000-7000-8000-00000000001c"),
          name: "Ambiguous fixture",
          schemaVersion: opened.diagnostics.schemaVersion,
          createdAt: REPLACED_AT,
          lastOpenedAt: REPLACED_AT,
        });
        const ambiguousBefore = JSON.stringify(
          await database.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
        );
        await expectRepositoryFailure(
          () => bootstrap.inspect(),
          (error) => error instanceof VaultLifecycleError && error.code === "invalid_state",
          "Ambiguous identities were silently selected.",
        );
        if (current === null) throw new DatabaseContractViolation("Missing acknowledged identity.");
        await expectRepositoryFailure(
          () => bootstrap.open({ vaultId: current.id, openedAt: REPLACED_AT }),
          (error) => error instanceof VaultLifecycleError && error.code === "invalid_state",
          "Ambiguous open rewrote operational state.",
        );
        assertContract(
          JSON.stringify(await database.query(sqlStatement("SELECT * FROM vault ORDER BY id"))) ===
            ambiguousBefore,
          "Ambiguous bootstrap mutated root identities.",
        );
        assertContract(
          JSON.stringify(await repositories.settings.list()) === settingsBefore,
          "Bootstrap changed existing local preferences.",
        );
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.persistSourceAggregate,
      run: async (database) => {
        await setup.migrate(database);
        await createSourceAggregate(database);
        const repositories = createTrackerRepositories(database);
        const existingSource = JSON.stringify(
          await database.query(sqlStatement("SELECT * FROM source_snapshot")),
        );
        const existingJob = JSON.stringify(await database.query(sqlStatement("SELECT * FROM job")));
        await createDatabaseVaultBootstrapPort(database).create({
          vaultId: IDS.vault,
          name: "Name existing local records",
          createdAt: CREATED_AT,
        });
        assertContract(
          JSON.stringify(await database.query(sqlStatement("SELECT * FROM source_snapshot"))) ===
            existingSource &&
            JSON.stringify(await database.query(sqlStatement("SELECT * FROM job"))) === existingJob,
          "Explicit initialization changed existing job or source records.",
        );
        const company = await repositories.companies.findById(IDS.company);
        const contact = await repositories.contacts.findById(IDS.contact);
        const job = await repositories.jobs.findById(IDS.job);
        const source = await repositories.jobSources.findById(IDS.jobSource);
        const snapshot = await repositories.provenance.findSnapshotById(IDS.snapshot);
        const provenance = await repositories.provenance.findById(IDS.provenance);

        assertContract(
          company?.canonicalName === "Northstar Research'); DROP TABLE job; --",
          "Bound company text did not round-trip.",
        );
        assertContract(contact?.email === "morgan@northstar.example", "Contact did not persist.");
        assertContract(
          job?.title === "Platform Engineer'); DROP TABLE company; --",
          "Bound job text did not round-trip.",
        );
        assertContract(source?.primary === true, "Primary source state did not persist.");
        assertContract(
          JSON.stringify(snapshot?.structuredData) ===
            JSON.stringify({ title: "Platform Engineer" }),
          "Structured snapshot data did not round-trip.",
        );
        assertContract(provenance?.confidence === 1, "Provenance confidence did not persist.");
        await verifySourceSnapshotHistory(database);
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.retainFieldCandidates,
      run: async (database) => {
        await setup.migrate(database);
        await createSourceAggregate(database);
        await appendFieldValues(database);
        const repositories = createTrackerRepositories(database);

        await expectRepositoryFailure(
          () =>
            repositories.fieldValues.supersedeUnconfirmed(
              IDS.currentFieldValue,
              IDS.replacementFieldValue,
              REPLACED_AT,
            ),
          (error) =>
            error instanceof TrackerRepositoryConflictError &&
            error.code === "confirmed_field_value_requires_explicit_replacement",
          "A confirmed field value was silently superseded.",
        );
        const before = await repositories.fieldValues.findById(IDS.currentFieldValue);
        assertContract(
          before?.supersededById === null,
          "Failed replacement mutated confirmed data.",
        );

        await replaceConfirmedFieldValue(database, {
          currentId: IDS.currentFieldValue,
          replacementId: IDS.replacementFieldValue,
          confirmation: {
            id: IDS.replacementConfirmation,
            confirmedAt: REPLACED_AT,
            confirmedValueHash: REPLACEMENT_HASH,
          },
          updatedAt: REPLACED_AT,
        });
        const candidates = await repositories.fieldValues.listForField("job", IDS.job, "title");
        const current = candidates.find(({ id }) => id === IDS.currentFieldValue);
        const replacement = candidates.find(({ id }) => id === IDS.replacementFieldValue);
        assertContract(
          current?.supersededById === IDS.replacementFieldValue,
          "Explicit replacement did not retain the supersession link.",
        );
        assertContract(
          replacement?.userConfirmation?.id === IDS.replacementConfirmation,
          "Explicit replacement did not persist its user confirmation.",
        );
        assertContract(candidates.length === 2, "Field candidate history was not retained.");
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.rollbackInvalidAggregate,
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createTrackerRepositories(database);
        const missingJobId = entityId("job", "0198e102-0000-7000-8000-0000000000ff");
        await expectRepositoryFailure(
          () =>
            repositories.jobSources.create({
              id: IDS.jobSource,
              jobId: missingJobId,
              connectorId: "manual",
              externalId: "missing-job",
              canonicalUrl: null,
              applyUrl: null,
              firstSeenAt: CREATED_AT,
              lastSeenAt: CREATED_AT,
              contentHash: null,
              primary: true,
              createdAt: CREATED_AT,
              updatedAt: CREATED_AT,
            }),
          () => true,
          "A job source accepted a missing job foreign key.",
        );
        interface CountRow extends QueryRow {
          readonly total: number;
        }
        const rows = await database.query<CountRow>(
          sqlStatement("SELECT count(*) AS total FROM job_source"),
        );
        assertContract(rows[0]?.total === 0, "Rejected aggregate left a partial source row.");
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.persistLocalDevice,
      run: async (database) => {
        await setup.migrate(database);
        const devices = createTrackerRepositories(database).devices;
        const registered = await devices.register({
          id: IDS.device,
          label: "Synthetic browser profile",
          platform: "web.chromium",
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          lastSeenAt: CREATED_AT,
        });
        const touched = await devices.touch(IDS.device, UPDATED_AT, UPDATED_AT, 1);
        assertContract(
          registered.rowVersion === 1 &&
            touched.rowVersion === 2 &&
            touched.lastSeenAt === UPDATED_AT,
          "Local device identity or audit advancement did not persist.",
        );
        await expectRepositoryFailure(
          () => devices.touch(IDS.device, REPLACED_AT, REPLACED_AT, 1),
          (error) =>
            error instanceof TrackerRepositoryConflictError &&
            error.code === "optimistic_write_conflict",
          "A stale device heartbeat overwrote a newer audit version.",
        );
        await expectRepositoryFailure(
          () =>
            devices.register({
              id: IDS.otherDevice,
              label: "Backward synthetic device",
              platform: "native.windows",
              createdAt: UPDATED_AT,
              updatedAt: CREATED_AT,
              lastSeenAt: UPDATED_AT,
            }),
          (error) => error instanceof TypeError,
          "A device accepted a backward audit timeline.",
        );
        await expectRepositoryFailure(
          () =>
            database.execute(
              sqlStatement(
                `INSERT INTO device(id, label, platform, created_at, updated_at, last_seen_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  "0198e102-0000-4000-8000-0000000000ff",
                  "Wrong UUID version",
                  "web.chromium",
                  CREATED_AT,
                  CREATED_AT,
                  CREATED_AT,
                ],
              ),
            ),
          () => true,
          "The device table accepted a non-UUIDv7 identity.",
        );

        interface TableInfoRow extends QueryRow {
          readonly name: string;
        }
        for (const table of [
          "application",
          "company",
          "contact",
          "device",
          "document",
          "field_value",
          "interaction",
          "interview",
          "job",
          "job_source",
          "location",
          "next_action",
          "reminder",
          "saved_view",
          "status_definition",
          "tag",
        ]) {
          const columns = await database.query<TableInfoRow>(
            sqlStatement(`PRAGMA table_info(${table})`),
          );
          const names = new Set(columns.map(({ name }) => name));
          assertContract(
            names.has("created_at") && names.has("updated_at") && names.has("row_version"),
            `${table} is missing required audit/future-conflict columns.`,
          );
        }
        for (const table of [
          "application",
          "company",
          "contact",
          "document",
          "job",
          "saved_view",
          "status_definition",
          "tag",
        ]) {
          const columns = await database.query<TableInfoRow>(
            sqlStatement(`PRAGMA table_info(${table})`),
          );
          assertContract(
            columns.some(({ name }) => name === "archived_at"),
            `${table} is missing its local soft-archive marker.`,
          );
        }
      },
    },
    {
      name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.tracker.cases.enforceDocumentIntegrity,
      run: async (database) => {
        await setup.migrate(database);
        await createSourceAggregate(database);
        const pipeline = createPipelineRepositories(database);
        const documents = createDocumentRepositories(database);
        await pipeline.statusDefinitions.create({
          id: IDS.status,
          name: "Synthetic saved",
          category: "saved",
          color: null,
          isSystem: false,
          sortOrder: 0,
          terminal: false,
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await documents.documents.create({
          id: IDS.resumeDocument,
          kind: "resume",
          title: "Synthetic resume",
          source: "user",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await documents.documents.create({
          id: IDS.otherDocument,
          kind: "other",
          title: "Synthetic other document",
          source: "user",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await documents.versions.create({
          id: IDS.resumeVersion,
          documentId: IDS.resumeDocument,
          versionNumber: 1,
          contentIrVersion: 1,
          contentIr: SYNTHETIC_IR,
          contentPlain: "Synthetic resume",
          templateId: null,
          createdBy: "user",
          createdAt: CREATED_AT,
          parentVersionId: null,
          contentHash: CONTENT_HASH,
          label: null,
        });
        await documents.versions.create({
          id: IDS.otherVersion,
          documentId: IDS.otherDocument,
          versionNumber: 1,
          contentIrVersion: 1,
          contentIr: SYNTHETIC_IR,
          contentPlain: "Synthetic other document",
          templateId: null,
          createdBy: "user",
          createdAt: CREATED_AT,
          parentVersionId: null,
          contentHash: VALUE_HASH,
          label: null,
        });
        await pipeline.applications.create({
          id: IDS.application,
          jobId: IDS.job,
          appliedAt: null,
          channel: null,
          currentStatusId: IDS.status,
          selectedResumeVersionId: IDS.resumeVersion,
          selectedCoverLetterVersionId: null,
          notes: "",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await expectRepositoryFailure(
          () =>
            pipeline.applications.create(
              {
                id: IDS.invalidApplication,
                jobId: IDS.job,
                appliedAt: null,
                channel: null,
                currentStatusId: IDS.status,
                selectedResumeVersionId: IDS.otherVersion,
                selectedCoverLetterVersionId: null,
                notes: "",
                archivedAt: null,
                createdAt: UPDATED_AT,
                updatedAt: UPDATED_AT,
              },
              { allowAdditionalAttempt: true },
            ),
          () => true,
          "An application selected a non-resume document as its resume.",
        );
        await expectRepositoryFailure(
          () =>
            database.execute(
              sqlStatement(
                `INSERT INTO document_version(
                   id, document_id, version_number, content_ir_version, content_ir_json,
                   content_plain, template_id, created_by, created_at, parent_version_id,
                   content_hash, label
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  IDS.invalidVersion,
                  IDS.otherDocument,
                  2,
                  1,
                  JSON.stringify(SYNTHETIC_IR),
                  "Invalid lineage",
                  null,
                  "user",
                  UPDATED_AT,
                  IDS.resumeVersion,
                  INVALID_VERSION_HASH,
                  null,
                ],
              ),
            ),
          () => true,
          "SQLite accepted a cross-document version parent.",
        );
        await expectRepositoryFailure(
          () =>
            database.execute(
              sqlStatement("UPDATE document_version SET label = ? WHERE id = ?", [
                "Mutation",
                IDS.resumeVersion,
              ]),
            ),
          () => true,
          "SQLite mutated immutable document-version content.",
        );
        await expectRepositoryFailure(
          () =>
            database.execute(
              sqlStatement("DELETE FROM document_version WHERE id = ?", [IDS.resumeVersion]),
            ),
          () => true,
          "SQLite deleted a document version selected by an application.",
        );
        await expectRepositoryFailure(
          () =>
            database.execute(
              sqlStatement("UPDATE document SET kind = 'other' WHERE id = ?", [IDS.resumeDocument]),
            ),
          () => true,
          "SQLite invalidated a selected resume by changing its document kind.",
        );

        await pipeline.interactions.append({
          id: IDS.interaction,
          jobId: IDS.job,
          contactId: null,
          type: "note",
          occurredAt: CREATED_AT,
          direction: "unknown",
          summary: "Synthetic interaction",
          nextActionAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await database.execute(
          sqlStatement(
            `INSERT INTO status_event(
               id, job_id, application_id, from_status_id, to_status_id, occurred_at, note,
               created_at
             ) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)`,
            [IDS.statusEvent, IDS.job, IDS.application, IDS.status, CREATED_AT, CREATED_AT],
          ),
        );
        await documents.attachments.register({
          contentId: ATTACHMENT_HASH,
          sha256: ATTACHMENT_HASH,
          mediaType: "application/pdf",
          byteLength: 2048,
          createdAt: CREATED_AT,
        });
        for (const statement of [
          sqlStatement("UPDATE source_snapshot SET raw_text = ? WHERE id = ?", [
            "Mutation",
            IDS.snapshot,
          ]),
          sqlStatement("UPDATE status_event SET note = ? WHERE id = ?", [
            "Mutation",
            IDS.statusEvent,
          ]),
          sqlStatement("UPDATE interaction SET summary = ? WHERE id = ?", [
            "Mutation",
            IDS.interaction,
          ]),
          sqlStatement("UPDATE attachment_manifest SET byte_length = 2049 WHERE content_id = ?", [
            ATTACHMENT_HASH,
          ]),
        ]) {
          await expectRepositoryFailure(
            () => database.execute(statement),
            () => true,
            "SQLite mutated an append-only or content-addressed record.",
          );
        }
      },
    },
  ]);
