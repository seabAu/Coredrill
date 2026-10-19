import {
  captureRequirementCoverageSnapshotV1,
  type ApplicationResult,
  type RequirementCoverageRerunDiffV1,
} from "@coredrill/application";
import type {
  JobWorkspaceContentActionRequest,
  JobWorkspaceContentModel,
  PipelineTableJob,
} from "@coredrill/ui";

import type { StoredJobComparison, StoredJobComparisonApi } from "./job-comparison.js";

export const storedJobTableRow = (value: StoredJobComparison): PipelineTableJob => ({
  id: value.jobId,
  title: value.title,
  company: value.company,
  capturedDate: null,
  appliedDate: null,
  disclosedSalary: null,
  lastInteraction: null,
  location: "Not recorded",
  marketBand: null,
  matchSummary: null,
  nextActionDate: null,
  priority: null,
  rowVersion: value.rowVersion,
  source: "Local vault",
  status: value.status,
  tags: [],
  workMode: "Not recorded",
});

export const storedRequirementReviews = (
  value: StoredJobComparison,
): JobWorkspaceContentModel["requirementEvidence"] =>
  value.evidence.map((review) => ({
    answerPolicy: review.answerPolicy,
    coverage: review.coverage,
    requirementId: review.requirementId,
    retrievalMode: review.capability.mode,
    queryTerms: review.queryTerms,
    candidates: review.candidates.map((item) => ({
      ...item,
      id: item.evidenceId,
      kind: item.evidenceKind,
    })),
    selectedEvidence: review.selectedEvidence.map((item) => ({
      ...item,
      id: item.evidenceId,
      kind: item.evidenceKind,
    })),
  }));

export const applyStoredRequirementAction = async (
  api: StoredJobComparisonApi,
  value: StoredJobComparison,
  request: JobWorkspaceContentActionRequest,
  onComparison: (requirementId: string, comparison: RequirementCoverageRerunDiffV1) => void,
): Promise<ApplicationResult<unknown> | null> => {
  if (request.id === "accept-requirement-proposal") {
    if (!value.requirementProposals.some(({ id }) => id === request.targetId)) return null;
    return api.accept({
      jobId: value.jobId,
      proposalId: request.targetId,
      category: request.category,
    });
  }
  if (request.id === "correct-requirement-category") {
    if (!value.requirements.some(({ id }) => id === request.targetId)) return null;
    return api.correct({
      id: request.targetId,
      category: request.category,
      expectedRowVersion: request.expectedRowVersion,
    });
  }
  if (
    request.id === "select-requirement-evidence" ||
    request.id === "remove-requirement-evidence"
  ) {
    const review = value.evidence.find(
      ({ requirementId }) => requirementId === request.requirementId,
    );
    const items =
      request.id === "select-requirement-evidence" ? review?.candidates : review?.selectedEvidence;
    const target = items?.find(({ evidenceId }) => evidenceId === request.targetId);
    if (target === undefined) return null;
    const input = {
      requirementId: request.requirementId,
      evidenceId: target.evidenceId,
      evidenceKind: target.evidenceKind,
    };
    return request.id === "select-requirement-evidence" ? api.select(input) : api.remove(input);
  }
  if (request.id === "set-requirement-coverage") {
    if (!value.requirements.some(({ id }) => id === request.requirementId)) return null;
    return api.setCoverage({
      requirementId: request.requirementId,
      state: request.state,
      expectedRowVersion: request.expectedRowVersion,
    });
  }
  if (request.id === "reset-requirement-coverage") {
    if (!value.requirements.some(({ id }) => id === request.requirementId)) return null;
    return api.resetCoverage({
      requirementId: request.requirementId,
      expectedRowVersion: request.expectedRowVersion,
    });
  }
  if (request.id === "rerun-requirement-coverage") {
    const review = value.evidence.find(
      ({ requirementId }) => requirementId === request.requirementId,
    );
    if (review === undefined) return null;
    const result = await api.rerun({
      requirementId: request.requirementId,
      baseline: captureRequirementCoverageSnapshotV1(review),
    });
    if (result.ok) onComparison(request.requirementId, result.value.comparison);
    return result;
  }
  return null;
};
