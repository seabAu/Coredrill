import { dateOnly, entityId, instant } from "@coredrill/domain";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import { openJobSearchRepository } from "./job-search.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

export interface JobSearchContractSetup {
  readonly expectedFts5: boolean;
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  activeJob: entityId("job", "0198e105-0000-7000-8000-000000000001"),
  archivedJob: entityId("job", "0198e105-0000-7000-8000-000000000002"),
  company: entityId("company", "0198e105-0000-7000-8000-000000000003"),
});
const CREATED_AT = instant("2026-08-25T17:00:00.000Z");
const UPDATED_AT = instant("2026-08-25T17:05:00.000Z");

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

const seedSearchRecords = async (database: DatabasePort): Promise<void> => {
  const repositories = createTrackerRepositories(database);
  await repositories.companies.create({
    id: IDS.company,
    canonicalName: "Northstar Research",
    websiteUrl: null,
    domain: "northstar.example",
    locationId: null,
    notes: "Builds quantum-safe developer tools.",
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repositories.jobs.create({
    id: IDS.activeJob,
    companyId: IDS.company,
    title: "Principal Platform Engineer",
    normalizedTitle: "principal platform engineer",
    descriptionText: "Design distributed systems with explicit provenance.",
    employmentType: "full_time",
    workplaceType: "remote",
    seniority: "principal",
    locationId: null,
    remoteRegion: null,
    datePosted: dateOnly("2026-08-20"),
    validThrough: null,
    currentStatusId: null,
    nextActionAt: null,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await repositories.jobs.create({
    id: IDS.archivedJob,
    companyId: null,
    title: "Archived Cobol Maintainer",
    normalizedTitle: "archived cobol maintainer",
    descriptionText: "A synthetic archived listing.",
    employmentType: "contract",
    workplaceType: "remote",
    seniority: "senior",
    locationId: null,
    remoteRegion: null,
    datePosted: null,
    validThrough: null,
    currentStatusId: null,
    nextActionAt: null,
    archivedAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
};

const assertSearchBehavior = async (
  database: DatabasePort,
  disableFts5: boolean,
  expectedMode: "fts5" | "normalized-token",
): Promise<void> => {
  const search = await openJobSearchRepository(database, { disableFts5 });
  assertContract(search.capability.mode === expectedMode, "Search selected the wrong capability.");

  const title = await search.search({ query: "platform engineer" });
  assertContract(
    title.results.length === 1 && title.results[0]?.jobId === IDS.activeJob,
    "Search did not require and match all normalized title tokens.",
  );
  const description = await search.search({ query: "distributed provenance" });
  assertContract(
    description.results.length === 1 && description.results[0]?.jobId === IDS.activeJob,
    "Search did not match job description content.",
  );
  const company = await search.search({ query: "quantum developer" });
  assertContract(
    company.results.length === 1 && company.results[0]?.companyName === "Northstar Research",
    "Search did not match joined company notes.",
  );
  const archived = await search.search({ query: "cobol" });
  assertContract(archived.results.length === 0, "Search returned an archived job by default.");
  const withArchived = await search.search({ query: "cobol", includeArchived: true });
  assertContract(
    withArchived.results.length === 1 && withArchived.results[0]?.jobId === IDS.archivedJob,
    "Search could not include archived jobs explicitly.",
  );
  const hostile = await search.search({ query: 'platform\\" OR notes:* --' });
  assertContract(hostile.results.length === 0, "Search interpreted user text as query syntax.");

  await database.execute(
    sqlStatement(
      `UPDATE job
       SET description_text = ?, updated_at = ?, row_version = row_version + 1
       WHERE id = ?`,
      ["Now owns deterministic migration tooling.", UPDATED_AT, IDS.activeJob],
    ),
  );
  const refreshed = await search.search({ query: "deterministic migration" });
  assertContract(
    refreshed.results.length === 1 && refreshed.results[0]?.updatedAt === UPDATED_AT,
    "Search did not refresh after indexed content changed.",
  );
  const removed = await search.search({ query: "distributed provenance" });
  assertContract(removed.results.length === 0, "Search retained stale job content.");
};

export const createJobSearchContractSuite = (
  setup: JobSearchContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite("phase-1-job-search", [
    {
      name: "detects FTS5 and refreshes the accelerated lexical index",
      run: async (database) => {
        await setup.migrate(database);
        await seedSearchRecords(database);
        await assertSearchBehavior(
          database,
          false,
          setup.expectedFts5 ? "fts5" : "normalized-token",
        );
      },
    },
    {
      name: "keeps normalized-token search functional with FTS5 disabled",
      run: async (database) => {
        await setup.migrate(database);
        await seedSearchRecords(database);
        await assertSearchBehavior(database, true, "normalized-token");
      },
    },
  ]);
