import { confidence, dateOnly, entityId, instant, webUrl } from "@coredrill/domain";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";
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
});

const CREATED_AT = instant("2026-08-25T12:00:00.000Z");
const UPDATED_AT = instant("2026-08-25T12:05:00.000Z");
const REPLACED_AT = instant("2026-08-25T12:10:00.000Z");
const CONTENT_HASH = "a".repeat(64);
const VALUE_HASH = "b".repeat(64);
const REPLACEMENT_HASH = "c".repeat(64);

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

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
  defineDatabaseContractSuite("phase-1-tracker-repositories", [
    {
      name: "migrates vault settings and preserves typed JSON",
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createTrackerRepositories(database);
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
      },
    },
    {
      name: "persists company contact job source snapshot and provenance with bound values",
      run: async (database) => {
        await setup.migrate(database);
        await createSourceAggregate(database);
        const repositories = createTrackerRepositories(database);
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
      },
    },
    {
      name: "retains field candidates and requires explicit confirmed replacement",
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
      name: "enforces foreign keys and rolls back an invalid aggregate",
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
  ]);
