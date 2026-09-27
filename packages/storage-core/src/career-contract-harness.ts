import { dateOnly, entityId, instant, webUrl } from "@coredrill/domain";

import { createCareerRepositories } from "./career-repositories.js";
import { createCareerStoryRepository } from "./career-story-repository.js";
import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";

const CAREER_REPOSITORY_CONTRACT_CASES = Object.freeze({
  roundTripAll:
    "round-trips employment education project skill accomplishment certification publication volunteer story and preferences",
  rollbackInvalidAggregate:
    "rolls back a career aggregate when a related source document is missing",
  rejectUnsafePrivacyTags: "rejects unsafe Career Profile story privacy tags",
  storyEvidenceLinks:
    "creates and edits a situation action result story with atomic canonical evidence links",
});

export const CAREER_REPOSITORY_CONTRACT_MANIFEST = Object.freeze({
  schemaVersion: 3 as const,
  suiteName: "phase-3-career-repositories-v3",
  cases: CAREER_REPOSITORY_CONTRACT_CASES,
  caseNames: Object.freeze([
    CAREER_REPOSITORY_CONTRACT_CASES.roundTripAll,
    CAREER_REPOSITORY_CONTRACT_CASES.rollbackInvalidAggregate,
    CAREER_REPOSITORY_CONTRACT_CASES.rejectUnsafePrivacyTags,
    CAREER_REPOSITORY_CONTRACT_CASES.storyEvidenceLinks,
  ]),
});

export type CareerRepositoryContractManifest = typeof CAREER_REPOSITORY_CONTRACT_MANIFEST;
export const CAREER_REPOSITORY_CONTRACT_CASE_NAMES = CAREER_REPOSITORY_CONTRACT_MANIFEST.caseNames;

export interface CareerRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const IDS = Object.freeze({
  employment: entityId("experience", "0199a300-0000-7000-8000-000000000001"),
  education: entityId("education", "0199a300-0000-7000-8000-000000000002"),
  project: entityId("project", "0199a300-0000-7000-8000-000000000003"),
  skill: entityId("skill", "0199a300-0000-7000-8000-000000000004"),
  accomplishment: entityId("accomplishment", "0199a300-0000-7000-8000-000000000005"),
  certification: entityId("certification", "0199a300-0000-7000-8000-000000000006"),
  publication: entityId("publication", "0199a300-0000-7000-8000-000000000007"),
  volunteer: entityId("volunteer-experience", "0199a300-0000-7000-8000-000000000008"),
  story: entityId("anecdote", "0199a300-0000-7000-8000-000000000009"),
  preference: entityId("candidate-profile", "0199a300-0000-7000-8000-00000000000a"),
  rollbackSkill: entityId("skill", "0199a300-0000-7000-8000-00000000000b"),
  rollbackEmployment: entityId("experience", "0199a300-0000-7000-8000-00000000000c"),
  missingDocument: entityId("document", "0199a300-0000-7000-8000-00000000000d"),
  invalidPrivacyStory: entityId("anecdote", "0199a300-0000-7000-8000-00000000000e"),
  linkedStory: entityId("anecdote", "0199a300-0000-7000-8000-00000000000f"),
  linkedEmployment: entityId("experience", "0199a300-0000-7000-8000-000000000010"),
  linkedSkill: entityId("skill", "0199a300-0000-7000-8000-000000000011"),
  missingLinkedSkill: entityId("skill", "0199a300-0000-7000-8000-000000000012"),
});

const CREATED_AT = instant("2026-09-27T12:00:00.000Z");
const UPDATED_AT = instant("2026-09-27T12:05:00.000Z");

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

export const createCareerRepositoryContractSuite = (
  setup: CareerRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(CAREER_REPOSITORY_CONTRACT_MANIFEST.suiteName, [
    {
      name: CAREER_REPOSITORY_CONTRACT_MANIFEST.cases.roundTripAll,
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createCareerRepositories(database);

        await repositories.employment.insert({
          id: IDS.employment,
          organization: "Coredrill Labs'); DROP TABLE experience; --",
          role: "Platform engineer",
          startDate: dateOnly("2024-01-01"),
          endDate: null,
          current: true,
          description: "Built local-first systems.",
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.education.insert({
          id: IDS.education,
          institution: "Example University",
          credential: "BSc",
          field: "Computer Science",
          startDate: dateOnly("2018-09-01"),
          endDate: dateOnly("2022-05-01"),
          details: "Systems concentration",
          sourceDocumentId: null,
          verificationState: "source_backed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.projects.insert({
          id: IDS.project,
          name: "Local-first portfolio",
          summary: "Offline-capable project evidence.",
          url: webUrl("https://example.invalid/projects/local-first"),
          startDate: dateOnly("2025-01-01"),
          endDate: dateOnly("2025-06-30"),
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.skills.insert({
          id: IDS.skill,
          canonicalName: "TypeScript",
          category: "language",
          aliases: Object.freeze(["TS"]),
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.accomplishments.insert({
          id: IDS.accomplishment,
          parentType: "project",
          parentId: IDS.project,
          action: "Designed a durable storage boundary",
          result: "Passed browser and native parity checks",
          metrics: Object.freeze({ adapters: 3, offline: true }),
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.certifications.insert({
          id: IDS.certification,
          name: "Synthetic systems certificate",
          issuer: "Example Institute",
          issuedDate: dateOnly("2025-03-01"),
          expiresDate: null,
          credentialUrl: webUrl("https://example.invalid/credentials/1"),
          sourceDocumentId: null,
          verificationState: "source_backed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.publications.insert({
          id: IDS.publication,
          title: "Designing accountable local software",
          publisher: "Example Journal",
          publishedDate: dateOnly("2025-08-15"),
          url: webUrl("https://example.invalid/publications/accountable-local"),
          summary: "A synthetic publication fixture.",
          sourceDocumentId: null,
          verificationState: "imported",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.volunteer.insert({
          id: IDS.volunteer,
          organization: "Community Tech Guild",
          role: "Mentor",
          startDate: dateOnly("2023-02-01"),
          endDate: null,
          current: true,
          description: "Mentored early-career developers.",
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.stories.insert({
          id: IDS.story,
          title: "Recovered a risky migration",
          situation: "A migration failed during validation.",
          action: "Preserved the source and repaired the boundary.",
          result: "The retry completed without data loss.",
          tags: Object.freeze(["recovery", "ownership"]),
          privacyTags: Object.freeze(["nda", "confidential-client"]),
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });
        await repositories.preferences.insert({
          id: IDS.preference,
          displayName: "Synthetic Candidate",
          summary: "Local-first product engineer",
          targetRoles: Object.freeze(["Staff Software Engineer"]),
          locationId: null,
          workPreferences: Object.freeze({ remote: true, travelPercentMax: 10 }),
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        });

        const activeCounts = await Promise.all([
          repositories.employment.listActive(),
          repositories.education.listActive(),
          repositories.projects.listActive(),
          repositories.skills.listActive(),
          repositories.accomplishments.listActive(),
          repositories.certifications.listActive(),
          repositories.publications.listActive(),
          repositories.volunteer.listActive(),
          repositories.stories.listActive(),
        ]);
        assertContract(
          activeCounts.every((records) => records.length === 1),
          "Every Career Profile repository must return its active record.",
        );
        const employment = await repositories.employment.findById(IDS.employment);
        const accomplishment = await repositories.accomplishments.findById(IDS.accomplishment);
        const story = await repositories.stories.findById(IDS.story);
        const preferences = await repositories.preferences.get();
        assertContract(
          employment?.organization === "Coredrill Labs'); DROP TABLE experience; --",
          "Bound employment text did not round-trip.",
        );
        assertContract(
          accomplishment?.metrics["adapters"] === 3,
          "Accomplishment metrics did not round-trip.",
        );
        assertContract(
          story?.privacyTags[0] === "confidential-client" && story.privacyTags[1] === "nda",
          "Career story privacy tags did not round-trip.",
        );
        assertContract(
          preferences?.targetRoles[0] === "Staff Software Engineer" &&
            preferences.workPreferences["remote"] === true,
          "Candidate preferences did not round-trip.",
        );
        assertContract(
          Object.isFrozen(preferences) && Object.isFrozen(preferences?.workPreferences),
          "Career repository results must be immutable.",
        );
      },
    },
    {
      name: CAREER_REPOSITORY_CONTRACT_MANIFEST.cases.rollbackInvalidAggregate,
      run: async (database) => {
        await setup.migrate(database);
        let rejected = false;
        try {
          await database.transaction(async (transaction) => {
            const repositories = createCareerRepositories(transaction);
            await repositories.skills.insert({
              id: IDS.rollbackSkill,
              canonicalName: "Rollback-only skill",
              category: null,
              aliases: Object.freeze([]),
              sourceDocumentId: null,
              verificationState: "user_confirmed",
              archivedAt: null,
              createdAt: CREATED_AT,
              updatedAt: CREATED_AT,
            });
            await repositories.employment.insert({
              id: IDS.rollbackEmployment,
              organization: "Missing source fixture",
              role: "Tester",
              startDate: null,
              endDate: null,
              current: false,
              description: "This insert must fail its foreign key.",
              sourceDocumentId: IDS.missingDocument,
              verificationState: "source_backed",
              archivedAt: null,
              createdAt: CREATED_AT,
              updatedAt: CREATED_AT,
            });
          });
        } catch {
          rejected = true;
        }
        assertContract(rejected, "Missing source-document identity must reject the transaction.");
        const rows = await database.query(
          sqlStatement("SELECT id FROM skill WHERE id = ?", [IDS.rollbackSkill]),
        );
        assertContract(rows.length === 0, "Rejected career transaction did not roll back.");
      },
    },
    {
      name: CAREER_REPOSITORY_CONTRACT_MANIFEST.cases.rejectUnsafePrivacyTags,
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createCareerRepositories(database);
        let rejected = false;
        try {
          await repositories.stories.insert({
            id: IDS.invalidPrivacyStory,
            title: "Unsafe privacy label",
            situation: "A caller supplied content instead of a privacy identifier.",
            action: "The storage boundary rejected it.",
            result: "No story row was written.",
            tags: Object.freeze([]),
            privacyTags: Object.freeze(["Contains private client details"]),
            sourceDocumentId: null,
            verificationState: "user_confirmed",
            archivedAt: null,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          });
        } catch {
          rejected = true;
        }
        assertContract(rejected, "Unsafe career privacy tag content must be rejected.");
        const rows = await database.query(
          sqlStatement("SELECT id FROM anecdote WHERE id = ?", [IDS.invalidPrivacyStory]),
        );
        assertContract(rows.length === 0, "Rejected career story must not be persisted.");
      },
    },
    {
      name: CAREER_REPOSITORY_CONTRACT_MANIFEST.cases.storyEvidenceLinks,
      run: async (database) => {
        await setup.migrate(database);
        const repositories = createCareerRepositories(database);
        await repositories.employment.insert({
          id: IDS.linkedEmployment,
          organization: "Contract Company",
          role: "Systems lead",
          startDate: null,
          endDate: null,
          current: false,
          description: "Canonical story evidence.",
          sourceDocumentId: null,
          verificationState: "user_confirmed",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        await repositories.skills.insert({
          id: IDS.linkedSkill,
          canonicalName: "SQLite",
          category: "database",
          aliases: Object.freeze([]),
          sourceDocumentId: null,
          verificationState: "imported",
          archivedAt: null,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        });
        const storyRepository = createCareerStoryRepository(database);
        const created = await storyRepository.create(
          {
            id: IDS.linkedStory,
            title: "Recovered a local migration",
            situation: "A local migration failed during validation.",
            action: "Preserved the source and repaired the boundary.",
            result: "The retry completed without data loss.",
            tags: Object.freeze(["recovery"]),
            privacyTags: Object.freeze(["confidential-client"]),
            sourceDocumentId: null,
            verificationState: "user_confirmed",
            archivedAt: null,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          },
          [{ evidenceKind: "employment", evidenceId: IDS.linkedEmployment }],
        );
        const updated = await storyRepository.update(
          {
            id: IDS.linkedStory,
            title: created.title,
            situation: created.situation,
            action: created.action,
            result: "The retry completed and the rollback path remained available.",
            tags: created.tags,
            privacyTags: created.privacyTags,
            expectedRowVersion: created.rowVersion,
            updatedAt: UPDATED_AT,
          },
          [{ evidenceKind: "skill", evidenceId: IDS.linkedSkill }],
        );
        assertContract(
          updated.rowVersion === 2 &&
            updated.verificationState === "user_confirmed" &&
            updated.privacyTags[0] === "confidential-client" &&
            updated.linkedEvidence.length === 1 &&
            updated.linkedEvidence[0]?.evidenceId === IDS.linkedSkill,
          "Career story content, privacy state, and evidence-link replacement did not round-trip.",
        );

        let rejected = false;
        try {
          await storyRepository.update(
            {
              id: IDS.linkedStory,
              title: updated.title,
              situation: updated.situation,
              action: updated.action,
              result: "This update must roll back.",
              tags: updated.tags,
              privacyTags: updated.privacyTags,
              expectedRowVersion: updated.rowVersion,
              updatedAt: UPDATED_AT,
            },
            [{ evidenceKind: "skill", evidenceId: IDS.missingLinkedSkill }],
          );
        } catch {
          rejected = true;
        }
        const afterFailure = (await storyRepository.listActive())[0];
        assertContract(rejected, "A missing story evidence target must reject the transaction.");
        assertContract(
          afterFailure?.result === updated.result &&
            afterFailure.rowVersion === updated.rowVersion &&
            afterFailure.linkedEvidence[0]?.evidenceId === IDS.linkedSkill,
          "Rejected Career story evidence replacement did not roll back atomically.",
        );
      },
    },
  ]);
