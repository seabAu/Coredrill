import type {
  RequirementCoverageState,
  RequirementEvidenceRetrievalDto,
  RequirementEvidenceSourceDocumentDto,
} from "./requirement-evidence.js";

export const REQUIREMENT_COVERAGE_RERUN_VERSION = "requirement-coverage-rerun-v1" as const;

export interface RequirementCoverageSnapshotEvidenceV1 {
  readonly evidenceId: string;
  readonly evidenceKind: string;
  readonly evidenceUpdatedAt: string;
  readonly label: string;
  readonly sourceDocument: RequirementEvidenceSourceDocumentDto | null;
  readonly summary: string;
  readonly verificationState: string;
}

export interface RequirementCoverageSnapshotV1 {
  readonly coverage: {
    readonly rowVersion: number | null;
    readonly source: "deterministic-rule" | "user-confirmed";
    readonly stale: boolean;
    readonly state: RequirementCoverageState;
  };
  readonly requirementId: string;
  readonly selectedEvidence: readonly RequirementCoverageSnapshotEvidenceV1[];
  readonly version: typeof REQUIREMENT_COVERAGE_RERUN_VERSION;
}

export type RequirementCoverageRerunTargetV1 = "coverage" | "evidence" | "source-document";
export type RequirementCoverageRerunChangeKindV1 = "added" | "changed" | "removed";

export interface RequirementCoverageRerunFieldChangeV1 {
  readonly after: string | null;
  readonly before: string | null;
  readonly field: string;
  readonly kind: RequirementCoverageRerunChangeKindV1;
  readonly target: RequirementCoverageRerunTargetV1;
  readonly targetId: string;
}

export interface RequirementCoverageRerunDiffV1 {
  readonly baseline: RequirementCoverageSnapshotV1;
  readonly changed: boolean;
  readonly changes: readonly RequirementCoverageRerunFieldChangeV1[];
  readonly current: RequirementCoverageSnapshotV1;
  readonly mutationPerformed: false;
  readonly userDecisionPreserved: boolean;
  readonly version: typeof REQUIREMENT_COVERAGE_RERUN_VERSION;
}

const COVERAGE_STATES = new Set<RequirementCoverageState>([
  "strength",
  "partial",
  "gap",
  "unknown",
  "not_applicable",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const boundedText = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

const assertSnapshot: (snapshot: unknown) => asserts snapshot is RequirementCoverageSnapshotV1 = (
  snapshot,
) => {
  if (!isRecord(snapshot)) {
    throw new TypeError("Requirement coverage snapshot is invalid.");
  }
  const coverage = snapshot["coverage"];
  const selectedEvidence = snapshot["selectedEvidence"];
  if (
    snapshot["version"] !== REQUIREMENT_COVERAGE_RERUN_VERSION ||
    !boundedText(snapshot["requirementId"], 128) ||
    !isRecord(coverage) ||
    !COVERAGE_STATES.has(coverage["state"] as RequirementCoverageState) ||
    !["deterministic-rule", "user-confirmed"].includes(coverage["source"] as string) ||
    typeof coverage["stale"] !== "boolean" ||
    (coverage["rowVersion"] !== null &&
      (!Number.isSafeInteger(coverage["rowVersion"]) || (coverage["rowVersion"] as number) < 1)) ||
    !Array.isArray(selectedEvidence) ||
    selectedEvidence.length > 32
  ) {
    throw new TypeError("Requirement coverage snapshot is invalid.");
  }
  const keys = new Set<string>();
  for (const evidence of selectedEvidence) {
    if (
      !isRecord(evidence) ||
      !boundedText(evidence["evidenceId"], 128) ||
      !boundedText(evidence["evidenceKind"], 64) ||
      !boundedText(evidence["evidenceUpdatedAt"], 64) ||
      !boundedText(evidence["label"], 1_024) ||
      !boundedText(evidence["summary"], 512) ||
      !boundedText(evidence["verificationState"], 64)
    ) {
      throw new TypeError("Requirement coverage snapshot evidence is invalid.");
    }
    const key = `${evidence["evidenceKind"]}:${evidence["evidenceId"]}`;
    if (keys.has(key)) throw new TypeError("Requirement coverage snapshot evidence is duplicated.");
    keys.add(key);
    const source = evidence["sourceDocument"];
    if (source === null) continue;
    if (!isRecord(source) || !boundedText(source["documentId"], 128)) {
      throw new TypeError("Requirement coverage source document is invalid.");
    }
    const latest = source["latestVersion"];
    if (latest === null) continue;
    if (
      !isRecord(latest) ||
      !boundedText(latest["id"], 128) ||
      typeof latest["contentHash"] !== "string" ||
      !/^[a-f0-9]{64}$/u.test(latest["contentHash"]) ||
      !Number.isSafeInteger(latest["versionNumber"]) ||
      (latest["versionNumber"] as number) < 1
    ) {
      throw new TypeError("Requirement coverage source document version is invalid.");
    }
  }
};

const changeKind = (
  before: string | null,
  after: string | null,
): RequirementCoverageRerunChangeKindV1 =>
  before === null ? "added" : after === null ? "removed" : "changed";

const sourceFields = (
  source: RequirementEvidenceSourceDocumentDto | null,
): Readonly<Record<string, string | null>> =>
  Object.freeze({
    contentHash: source?.latestVersion?.contentHash ?? null,
    documentId: source?.documentId ?? null,
    latestVersionId: source?.latestVersion?.id ?? null,
    versionNumber:
      source?.latestVersion === null || source?.latestVersion === undefined
        ? null
        : String(source.latestVersion.versionNumber),
  });

const addChange = (
  changes: RequirementCoverageRerunFieldChangeV1[],
  target: RequirementCoverageRerunTargetV1,
  targetId: string,
  field: string,
  before: string | null,
  after: string | null,
): void => {
  if (before === after) return;
  changes.push(
    Object.freeze({ after, before, field, kind: changeKind(before, after), target, targetId }),
  );
};

export const captureRequirementCoverageSnapshotV1 = (
  retrieval: RequirementEvidenceRetrievalDto,
): RequirementCoverageSnapshotV1 =>
  Object.freeze({
    coverage: Object.freeze({
      rowVersion: retrieval.coverage.rowVersion,
      source: retrieval.coverage.source,
      stale: retrieval.coverage.stale,
      state: retrieval.coverage.state,
    }),
    requirementId: retrieval.requirementId,
    selectedEvidence: Object.freeze(
      retrieval.selectedEvidence
        .map((evidence) =>
          Object.freeze({
            evidenceId: evidence.evidenceId,
            evidenceKind: evidence.evidenceKind,
            evidenceUpdatedAt: evidence.evidenceUpdatedAt,
            label: evidence.label,
            sourceDocument:
              evidence.sourceDocument === null
                ? null
                : Object.freeze({
                    documentId: evidence.sourceDocument.documentId,
                    latestVersion:
                      evidence.sourceDocument.latestVersion === null
                        ? null
                        : Object.freeze({ ...evidence.sourceDocument.latestVersion }),
                  }),
            summary: evidence.summary,
            verificationState: evidence.verificationState,
          }),
        )
        .sort(
          (left, right) =>
            left.evidenceKind.localeCompare(right.evidenceKind) ||
            left.evidenceId.localeCompare(right.evidenceId),
        ),
    ),
    version: REQUIREMENT_COVERAGE_RERUN_VERSION,
  });

export const compareRequirementCoverageRunsV1 = (
  baseline: RequirementCoverageSnapshotV1,
  current: RequirementCoverageSnapshotV1,
): RequirementCoverageRerunDiffV1 => {
  assertSnapshot(baseline);
  assertSnapshot(current);
  if (baseline.requirementId !== current.requirementId) {
    throw new TypeError("Requirement coverage snapshots are incompatible.");
  }

  const changes: RequirementCoverageRerunFieldChangeV1[] = [];
  addChange(
    changes,
    "coverage",
    baseline.requirementId,
    "state",
    baseline.coverage.state,
    current.coverage.state,
  );
  addChange(
    changes,
    "coverage",
    baseline.requirementId,
    "source",
    baseline.coverage.source,
    current.coverage.source,
  );
  addChange(
    changes,
    "coverage",
    baseline.requirementId,
    "stale",
    String(baseline.coverage.stale),
    String(current.coverage.stale),
  );

  const before = new Map(
    baseline.selectedEvidence.map((evidence) => [
      `${evidence.evidenceKind}:${evidence.evidenceId}`,
      evidence,
    ]),
  );
  const after = new Map(
    current.selectedEvidence.map((evidence) => [
      `${evidence.evidenceKind}:${evidence.evidenceId}`,
      evidence,
    ]),
  );
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  for (const key of keys) {
    const previous = before.get(key);
    const next = after.get(key);
    const targetId = next?.evidenceId ?? previous?.evidenceId ?? key;
    if (previous === undefined || next === undefined) {
      addChange(
        changes,
        "evidence",
        targetId,
        "selection",
        previous === undefined ? null : "selected",
        next === undefined ? null : "selected",
      );
      continue;
    }
    addChange(changes, "evidence", targetId, "label", previous.label, next.label);
    addChange(changes, "evidence", targetId, "summary", previous.summary, next.summary);
    addChange(
      changes,
      "evidence",
      targetId,
      "verificationState",
      previous.verificationState,
      next.verificationState,
    );
    addChange(
      changes,
      "evidence",
      targetId,
      "evidenceUpdatedAt",
      previous.evidenceUpdatedAt,
      next.evidenceUpdatedAt,
    );
    const previousSource = sourceFields(previous.sourceDocument);
    const nextSource = sourceFields(next.sourceDocument);
    for (const field of [
      "documentId",
      "latestVersionId",
      "versionNumber",
      "contentHash",
    ] as const) {
      addChange(
        changes,
        "source-document",
        targetId,
        field,
        previousSource[field] ?? null,
        nextSource[field] ?? null,
      );
    }
  }

  const userDecisionPreserved =
    baseline.coverage.source !== "user-confirmed" ||
    (current.coverage.source === "user-confirmed" &&
      current.coverage.state === baseline.coverage.state &&
      current.coverage.rowVersion === baseline.coverage.rowVersion);
  return Object.freeze({
    baseline,
    changed: changes.length > 0,
    changes: Object.freeze(changes),
    current,
    mutationPerformed: false as const,
    userDecisionPreserved,
    version: REQUIREMENT_COVERAGE_RERUN_VERSION,
  });
};
