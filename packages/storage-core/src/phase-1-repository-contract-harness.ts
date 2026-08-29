import { defineDatabaseContractSuite, type DatabaseContractSuite } from "./contract-harness.js";
import type { DatabasePort } from "./database-port.js";
import { createDiagnosticRepositoryContractSuite } from "./diagnostic-contract-harness.js";
import { createDocumentRepositoryContractSuite } from "./document-contract-harness.js";
import { createJobSearchContractSuite } from "./job-search-contract-harness.js";
import { createPipelineRepositoryContractSuite } from "./pipeline-contract-harness.js";
import {
  PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
} from "./repository-contract-manifest.js";
import { createTrackerRepositoryContractSuite } from "./tracker-contract-harness.js";
import { createViewRepositoryContractSuite } from "./view-contract-harness.js";

export interface Phase1RepositoryContractSetup {
  readonly expectedFts5: boolean;
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const assertComponentMatches = (
  suite: DatabaseContractSuite,
  component: (typeof PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components)[keyof typeof PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components],
): void => {
  const caseNames = suite.cases.map(({ name }) => name);
  const reviewedCaseNames = Object.values(component.cases);
  if (
    suite.name !== component.suiteName ||
    caseNames.length !== reviewedCaseNames.length ||
    caseNames.some((name, index) => name !== reviewedCaseNames[index])
  ) {
    throw new TypeError(
      `Repository contract component ${component.suiteName} drifted from manifest.`,
    );
  }
};

export const createPhase1RepositoryContractSuite = (
  setup: Phase1RepositoryContractSetup,
): DatabaseContractSuite => {
  const { components } = PHASE_1_REPOSITORY_CONTRACT_MANIFEST;
  const suites = [
    [createTrackerRepositoryContractSuite(setup), components.tracker],
    [createPipelineRepositoryContractSuite(setup), components.pipeline],
    [createViewRepositoryContractSuite(setup), components.view],
    [createDocumentRepositoryContractSuite(setup), components.document],
    [createJobSearchContractSuite(setup), components.jobSearch],
    [createDiagnosticRepositoryContractSuite(setup), components.diagnostic],
  ] as const;

  for (const [suite, manifestComponent] of suites) {
    assertComponentMatches(suite, manifestComponent);
  }

  const aggregate = defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.suiteName,
    suites.flatMap(([suite]) => suite.cases),
  );
  const aggregateCaseNames = aggregate.cases.map(({ name }) => name);
  if (
    aggregateCaseNames.length !== PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES.length ||
    aggregateCaseNames.some((name, index) => name !== PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES[index])
  ) {
    throw new TypeError("Aggregate repository contract suite drifted from manifest.");
  }
  return aggregate;
};
