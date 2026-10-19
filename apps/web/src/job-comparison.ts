import {
  applicationFailure,
  applicationSuccess,
  createJobRequirementOperations,
  createRequirementEvidenceOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type JobRequirementDto,
  type RequirementEvidenceRetrievalDto,
} from "@coredrill/application";
import { entityId, generateEntityId } from "@coredrill/domain";
import {
  createJobRequirementRepository,
  createPipelineRepositories,
  createTrackerRepositories,
  openRequirementEvidenceRepository,
  sqlStatement,
  type DatabasePort,
} from "@coredrill/storage-core";

export interface StoredJobComparison {
  readonly jobId: string;
  readonly title: string;
  readonly company: string;
  readonly description: string;
  readonly createdAt: string;
  readonly rowVersion: number;
  readonly applicationId: string | null;
  readonly status: {
    readonly id: string;
    readonly name: string;
    readonly terminal: boolean;
  } | null;
  readonly requirements: readonly JobRequirementDto[];
  readonly evidence: readonly RequirementEvidenceRetrievalDto[];
}

/** Runtime composition only: the existing application operations own validation and writes. */
export const createStoredJobComparisonApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
) => {
  const requirements = createJobRequirementOperations({
    createId: (kind) => generateEntityId(kind),
    requirements: {
      recordRequirement: async (input) =>
        createJobRequirementRepository(await database()).create(input),
      correctRequirement: async (input) =>
        createJobRequirementRepository(await database()).correct(input),
      listRequirements: async (jobId) =>
        createJobRequirementRepository(await database()).listForJob(jobId),
    },
  });
  const evidenceRepository = async () => openRequirementEvidenceRepository(await database());
  const evidence = createRequirementEvidenceOperations({
    evidence: {
      retrieve: async (input) => (await evidenceRepository()).retrieve(input),
      select: async (input) => (await evidenceRepository()).select(input),
      remove: async (input) => (await evidenceRepository()).remove(input),
      setCoverageDecision: async (input) => (await evidenceRepository()).setCoverageDecision(input),
      resetCoverageDecision: async (input) =>
        (await evidenceRepository()).resetCoverageDecision(input),
    },
  });
  return Object.freeze({
    load: async (id: string): Promise<ApplicationResult<StoredJobComparison>> => {
      try {
        const jobId = entityId("job", id);
        const client = await database();
        const tracker = createTrackerRepositories(client);
        const job = await tracker.jobs.findById(jobId);
        if (job?.archivedAt !== null) {
          return applicationFailure({
            code: "not_found",
            message: "This local job is no longer available.",
            retryable: false,
          });
        }
        const company =
          job.companyId === null ? undefined : await tracker.companies.findById(job.companyId);
        const listed = await requirements.listRequirementsQuery.execute({ jobId }, context());
        if (!listed.ok) return listed;
        const reviews: RequirementEvidenceRetrievalDto[] = [];
        for (const requirement of listed.value) {
          const retrieved = await evidence.retrieveCandidatesQuery.execute(
            { requirementId: requirement.id, limit: 50 },
            context(),
          );
          if (!retrieved.ok) return retrieved;
          reviews.push(retrieved.value);
        }
        const applications = await client.query(
          sqlStatement(
            `SELECT id FROM application WHERE job_id = ? AND archived_at IS NULL
           ORDER BY created_at DESC, id DESC LIMIT 1`,
            [jobId],
          ),
        );
        const applicationId = applications[0]?.["id"];
        const status =
          job.currentStatusId === null
            ? undefined
            : await createPipelineRepositories(client).statusDefinitions.findById(
                job.currentStatusId,
              );
        return applicationSuccess(
          Object.freeze({
            jobId,
            title: job.title,
            company: company?.canonicalName ?? "Company not recorded",
            description: job.descriptionText,
            createdAt: job.createdAt,
            rowVersion: job.rowVersion,
            applicationId: typeof applicationId === "string" ? applicationId : null,
            status:
              status === undefined
                ? null
                : {
                    id: status.id,
                    name: status.name,
                    terminal: status.terminal,
                  },
            requirements: listed.value,
            evidence: Object.freeze(reviews),
          }),
        );
      } catch {
        return applicationFailure({
          code: "unavailable",
          message: "The stored job comparison could not be loaded.",
          retryable: true,
        });
      }
    },
    correct: (input: Parameters<typeof requirements.correctRequirementCommand.execute>[0]) =>
      requirements.correctRequirementCommand.execute(input, context()),
    select: (input: Parameters<typeof evidence.selectEvidenceCommand.execute>[0]) =>
      evidence.selectEvidenceCommand.execute(input, context()),
    remove: (input: Parameters<typeof evidence.removeEvidenceCommand.execute>[0]) =>
      evidence.removeEvidenceCommand.execute(input, context()),
    setCoverage: (input: Parameters<typeof evidence.setCoverageDecisionCommand.execute>[0]) =>
      evidence.setCoverageDecisionCommand.execute(input, context()),
    resetCoverage: (input: Parameters<typeof evidence.resetCoverageDecisionCommand.execute>[0]) =>
      evidence.resetCoverageDecisionCommand.execute(input, context()),
    rerun: (input: Parameters<typeof evidence.rerunCoverageQuery.execute>[0]) =>
      evidence.rerunCoverageQuery.execute(input, context()),
  });
};

export type StoredJobComparisonApi = ReturnType<typeof createStoredJobComparisonApi>;
