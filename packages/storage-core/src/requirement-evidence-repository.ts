import {
  REQUIREMENT_COVERAGE_STATES,
  REQUIREMENT_EVIDENCE_KINDS,
  REQUIREMENT_EVIDENCE_REASONS,
  RequirementEvidenceError,
  classifyApplicationQuestion,
  deriveRequirementCoverageDecision,
  requirementCoverageSelectionBasis,
  type RequirementCoverageDecisionDto,
  type RequirementCoverageState,
  type RequirementEvidenceCandidateDto,
  type RequirementEvidenceFallbackReason,
  type RequirementEvidenceItemDto,
  type RequirementEvidenceKind,
  type RequirementEvidencePort,
  type RequirementEvidenceReason,
  type RequirementEvidenceRetrievalDto,
  type RequirementEvidenceSearchMode,
  type RequirementEvidenceVerificationState,
  type SelectedRequirementEvidenceDto,
  type StoredRequirementCoverageDecisionDto,
} from "@coredrill/application";
import { entityId, instant, type EntityId, type JobRequirementCategory } from "@coredrill/domain";

import {
  sqlStatement,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

export const REQUIREMENT_EVIDENCE_LIMITS = Object.freeze({
  candidateLimit: 50,
  relationshipRows: 20_000,
  searchRows: 10_000,
  selectionsPerRequirement: 32,
  terms: 24,
} as const);

export interface OpenRequirementEvidenceRepositoryOptions {
  readonly disableFts5?: boolean;
}

interface EvidenceContentRow extends QueryRow {
  readonly evidence_kind: string;
  readonly evidence_id: string;
  readonly label: string;
  readonly searchable_text: string;
  readonly verification_state: string;
  readonly privacy_tags_json: string;
  readonly updated_at: string;
}

interface RequirementRow extends QueryRow {
  readonly category: string;
  readonly id: string;
  readonly normalized_text: string;
  readonly raw_text: string;
  readonly row_version: number;
}

interface SelectionRow extends EvidenceContentRow {
  readonly requirement_id: string;
  readonly selected_at: string;
}

interface CoverageDecisionRow extends QueryRow {
  readonly coverage_state: string;
  readonly decided_at: string;
  readonly requirement_row_version: number;
  readonly row_version: number;
  readonly selection_basis: string;
}

interface SkillRow extends QueryRow {
  readonly id: string;
  readonly canonical_name: string;
  readonly aliases_json: string;
}

interface SkillRelationRow extends QueryRow {
  readonly skill_id: string;
  readonly evidence_kind: string;
  readonly evidence_id: string;
}

interface StoryRelationRow extends QueryRow {
  readonly anecdote_id: string;
  readonly evidence_kind: string;
  readonly evidence_id: string;
}

interface AccomplishmentRelationRow extends QueryRow {
  readonly id: string;
  readonly parent_type: string;
  readonly parent_id: string | null;
}

const VERIFICATION_STATES = new Set<RequirementEvidenceVerificationState>([
  "disputed",
  "imported",
  "source_backed",
  "stale",
  "user_confirmed",
]);
const STOP_TERMS = new Set([
  "and",
  "are",
  "for",
  "from",
  "have",
  "into",
  "lead",
  "must",
  "our",
  "that",
  "the",
  "their",
  "this",
  "through",
  "with",
  "will",
  "years",
  "you",
]);
const TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu;

const TARGET_BY_KIND = Object.freeze({
  employment: Object.freeze({ column: "experience_id", entity: "experience" }),
  education: Object.freeze({ column: "education_id", entity: "education" }),
  project: Object.freeze({ column: "project_id", entity: "project" }),
  skill: Object.freeze({ column: "skill_id", entity: "skill" }),
  accomplishment: Object.freeze({ column: "accomplishment_id", entity: "accomplishment" }),
  certification: Object.freeze({ column: "certification_id", entity: "certification" }),
  publication: Object.freeze({ column: "publication_id", entity: "publication" }),
  volunteer: Object.freeze({ column: "volunteer_experience_id", entity: "volunteer-experience" }),
  story: Object.freeze({ column: "anecdote_id", entity: "anecdote" }),
} as const);

const SELECTION_COLUMNS = Object.freeze([
  "requirement_id",
  "evidence_kind",
  "evidence_id",
  "experience_id",
  "education_id",
  "project_id",
  "skill_id",
  "accomplishment_id",
  "certification_id",
  "publication_id",
  "volunteer_experience_id",
  "anecdote_id",
  "selected_at",
]);

const CREATE_FTS_SQL = sqlStatement(`
  CREATE VIRTUAL TABLE career_evidence_fts USING fts5(
    evidence_kind UNINDEXED,
    evidence_id UNINDEXED,
    label,
    searchable_text,
    tokenize='unicode61 remove_diacritics 2'
  )
`);
const DROP_FTS_SQL = sqlStatement("DROP TABLE IF EXISTS career_evidence_fts");
const REBUILD_FTS_SQL = sqlStatement(`
  INSERT INTO career_evidence_fts(evidence_kind, evidence_id, label, searchable_text)
  SELECT evidence_kind, evidence_id, label, searchable_text
  FROM career_evidence_search_content
  ORDER BY evidence_kind, evidence_id
`);
const CONTENT_COLUMNS =
  "content.evidence_kind, content.evidence_id, content.label, content.searchable_text, content.verification_state, content.privacy_tags_json, content.updated_at";

const evidenceKind = (value: string): RequirementEvidenceKind => {
  if (!REQUIREMENT_EVIDENCE_KINDS.includes(value as RequirementEvidenceKind)) {
    throw new Error("Stored requirement evidence kind is invalid.");
  }
  return value as RequirementEvidenceKind;
};

const verificationState = (value: string): RequirementEvidenceVerificationState => {
  if (!VERIFICATION_STATES.has(value as RequirementEvidenceVerificationState)) {
    throw new Error("Stored requirement evidence verification state is invalid.");
  }
  return value as RequirementEvidenceVerificationState;
};

const REQUIREMENT_CATEGORIES = new Set<JobRequirementCategory>([
  "required",
  "desired",
  "responsibility",
  "context",
  "constraint",
]);

const requirementCategory = (value: string): JobRequirementCategory => {
  if (!REQUIREMENT_CATEGORIES.has(value as JobRequirementCategory)) {
    throw new Error("Stored requirement category is invalid.");
  }
  return value as JobRequirementCategory;
};

const requirementCoverageState = (value: string): RequirementCoverageState => {
  if (!REQUIREMENT_COVERAGE_STATES.includes(value as RequirementCoverageState)) {
    throw new Error("Stored requirement coverage state is invalid.");
  }
  return value as RequirementCoverageState;
};

const boundedText = (value: unknown, label: string, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    value.includes("\u0000")
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
};

const parseStringArray = (value: string): readonly string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("Stored evidence privacy tags are invalid.", { cause: error });
  }
  if (!Array.isArray(parsed) || parsed.length > 16) {
    throw new Error("Stored evidence privacy tags are invalid.");
  }
  const items: string[] = [];
  for (const item of parsed as unknown[]) {
    if (typeof item !== "string" || item.length > 64 || item.includes("\u0000")) {
      throw new Error("Stored evidence privacy tags are invalid.");
    }
    items.push(item);
  }
  return Object.freeze(items);
};

const contentKey = (kind: RequirementEvidenceKind, id: string): string => `${kind}:${id}`;

const mapItem = (row: EvidenceContentRow): RequirementEvidenceItemDto => {
  const kind = evidenceKind(row.evidence_kind);
  const searchable = boundedText(row.searchable_text, "Stored evidence search text", 1_000_000);
  const summary = searchable
    .split("\u001f")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ")
    .slice(0, 512);
  return Object.freeze({
    evidenceId: entityId(TARGET_BY_KIND[kind].entity, row.evidence_id),
    evidenceKind: kind,
    evidenceUpdatedAt: instant(row.updated_at),
    label: boundedText(row.label, "Stored evidence label", 1_024),
    summary,
    verificationState: verificationState(row.verification_state),
    privacyTags: parseStringArray(row.privacy_tags_json),
  });
};

const normalizePhrase = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();

const phraseContains = (phrase: string, candidate: string): boolean => {
  if (candidate.length === 0) return false;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(phrase);
};

export const normalizeRequirementEvidenceTerms = (value: string): readonly string[] => {
  const matches = normalizePhrase(value).match(TERM_PATTERN) ?? [];
  const terms = matches
    .map((term) => term.replace(/^[.+-]+|[.+-]+$/gu, ""))
    .filter((term) => term.length >= 2 && !STOP_TERMS.has(term));
  return Object.freeze([...new Set(terms)].slice(0, REQUIREMENT_EVIDENCE_LIMITS.terms));
};

const ftsQuery = (terms: readonly string[]): string =>
  terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const detectFts5 = async (database: DatabasePort): Promise<boolean> => {
  try {
    await database.execute(
      sqlStatement("CREATE VIRTUAL TABLE temp.coredrill_career_fts_probe USING fts5(token)"),
    );
    await database.execute(sqlStatement("DROP TABLE temp.coredrill_career_fts_probe"));
    return true;
  } catch {
    try {
      await database.execute(sqlStatement("DROP TABLE IF EXISTS temp.coredrill_career_fts_probe"));
    } catch {
      // A failed probe must not replace the bounded fallback.
    }
    return false;
  }
};

const rebuildFts = async (database: DatabasePort): Promise<void> => {
  await database.transaction(async (transaction) => {
    await transaction.execute(DROP_FTS_SQL);
    await transaction.execute(CREATE_FTS_SQL);
    await transaction.execute(REBUILD_FTS_SQL);
  });
};

const loadAllContent = async (database: DatabasePort): Promise<readonly EvidenceContentRow[]> => {
  const rows = await database.query<EvidenceContentRow>(
    sqlStatement(
      `SELECT evidence_kind, evidence_id, label, searchable_text, verification_state,
              privacy_tags_json, updated_at
       FROM career_evidence_search_content
       ORDER BY evidence_kind, evidence_id
       LIMIT ?`,
      [REQUIREMENT_EVIDENCE_LIMITS.searchRows + 1],
    ),
  );
  if (rows.length > REQUIREMENT_EVIDENCE_LIMITS.searchRows) {
    throw new Error("Career evidence search corpus exceeds its reviewed bound.");
  }
  rows.forEach(mapItem);
  return rows;
};

const lexicalRows = async (
  database: DatabasePort,
  mode: RequirementEvidenceSearchMode,
  terms: readonly string[],
): Promise<readonly EvidenceContentRow[]> => {
  if (terms.length === 0) return Object.freeze([]);
  if (mode === "fts5") {
    return database.query<EvidenceContentRow>(
      sqlStatement(
        `SELECT ${CONTENT_COLUMNS}
         FROM career_evidence_fts
         INNER JOIN career_evidence_search_content AS content
           ON content.evidence_kind = career_evidence_fts.evidence_kind
          AND content.evidence_id = career_evidence_fts.evidence_id
         WHERE career_evidence_fts MATCH ?
         ORDER BY bm25(career_evidence_fts), content.updated_at DESC,
                  content.evidence_kind, content.evidence_id
         LIMIT ?`,
        [ftsQuery(terms), REQUIREMENT_EVIDENCE_LIMITS.candidateLimit],
      ),
    );
  }
  const searchable = "lower(content.label || char(31) || content.searchable_text)";
  return database.query<EvidenceContentRow>(
    sqlStatement(
      `SELECT ${CONTENT_COLUMNS}
       FROM career_evidence_search_content AS content
       WHERE ${terms.map(() => `${searchable} LIKE ? ESCAPE '\\'`).join(" OR ")}
       ORDER BY content.updated_at DESC, content.evidence_kind, content.evidence_id
       LIMIT ?`,
      [...terms.map((term) => `%${escapeLike(term)}%`), REQUIREMENT_EVIDENCE_LIMITS.candidateLimit],
    ),
  );
};

const readRequirement = async (
  database: DatabaseSession,
  requirementId: EntityId<"job-requirement">,
): Promise<RequirementRow> => {
  const rows = await database.query<RequirementRow>(
    sqlStatement(
      "SELECT id, category, normalized_text, raw_text, row_version FROM job_requirement WHERE id = ?",
      [requirementId],
    ),
  );
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new TypeError("Requirement evidence retrieval target is missing.");
  }
  return row;
};

const readCoverageDecision = async (
  database: DatabaseSession,
  requirementId: EntityId<"job-requirement">,
): Promise<StoredRequirementCoverageDecisionDto | null> => {
  const rows = await database.query<CoverageDecisionRow>(
    sqlStatement(
      `SELECT coverage_state, requirement_row_version, selection_basis, decided_at, row_version
       FROM job_requirement_coverage_decision
       WHERE requirement_id = ?`,
      [requirementId],
    ),
  );
  if (rows.length > 1) throw new Error("Requirement coverage decision is not unique.");
  const row = rows[0];
  if (row === undefined) return null;
  if (
    !Number.isSafeInteger(row.requirement_row_version) ||
    row.requirement_row_version < 1 ||
    !Number.isSafeInteger(row.row_version) ||
    row.row_version < 1 ||
    row.selection_basis.length > 4_096
  ) {
    throw new Error("Stored requirement coverage decision is invalid.");
  }
  return Object.freeze({
    decidedAt: instant(row.decided_at),
    requirementRowVersion: row.requirement_row_version,
    rowVersion: row.row_version,
    selectionBasis: row.selection_basis,
    state: requirementCoverageState(row.coverage_state),
  });
};

const readSelections = async (
  database: DatabaseSession,
  requirementId: EntityId<"job-requirement">,
): Promise<readonly SelectedRequirementEvidenceDto[]> => {
  const rows = await database.query<SelectionRow>(
    sqlStatement(
      `SELECT selection.requirement_id, selection.selected_at, ${CONTENT_COLUMNS}
       FROM job_requirement_evidence_selection AS selection
       INNER JOIN career_evidence_search_content AS content
         ON content.evidence_kind = selection.evidence_kind
        AND content.evidence_id = selection.evidence_id
       WHERE selection.requirement_id = ?
       ORDER BY selection.selected_at, selection.evidence_kind, selection.evidence_id
       LIMIT ?`,
      [requirementId, REQUIREMENT_EVIDENCE_LIMITS.selectionsPerRequirement + 1],
    ),
  );
  if (rows.length > REQUIREMENT_EVIDENCE_LIMITS.selectionsPerRequirement) {
    throw new Error("Requirement evidence selection exceeds its reviewed bound.");
  }
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        ...mapItem(row),
        matchedTerms: Object.freeze([]),
        reasons: Object.freeze([]),
        requirementId: entityId("job-requirement", row.requirement_id),
        selectedAt: instant(row.selected_at),
      }),
    ),
  );
};

const relationRows = async <Row extends QueryRow>(
  database: DatabasePort,
  sql: string,
): Promise<readonly Row[]> => {
  const rows = await database.query<Row>(
    sqlStatement(`${sql} LIMIT ?`, [REQUIREMENT_EVIDENCE_LIMITS.relationshipRows + 1]),
  );
  if (rows.length > REQUIREMENT_EVIDENCE_LIMITS.relationshipRows) {
    throw new Error("Career evidence relationships exceed their reviewed bound.");
  }
  return rows;
};

interface CandidateAccumulator {
  readonly item: RequirementEvidenceItemDto;
  readonly matchedTerms: Set<string>;
  readonly reasons: Set<RequirementEvidenceReason>;
}

const scoreCandidate = (candidate: CandidateAccumulator): number => {
  let score = 0;
  if (candidate.reasons.has("exact-skill")) score = Math.max(score, 400);
  if (candidate.reasons.has("skill-relation")) score = Math.max(score, 300);
  if (candidate.reasons.has("story-relation")) score = Math.max(score, 260);
  if (candidate.reasons.has("accomplishment-parent")) score = Math.max(score, 240);
  if (candidate.reasons.has("lexical")) score = Math.max(score, 200);
  return score + candidate.matchedTerms.size * 10 + candidate.reasons.size;
};

const REASON_ORDER = new Map(
  REQUIREMENT_EVIDENCE_REASONS.map((reason, index) => [reason, index] as const),
);

const toCandidate = (candidate: CandidateAccumulator): RequirementEvidenceCandidateDto =>
  Object.freeze({
    ...candidate.item,
    matchedTerms: Object.freeze([...candidate.matchedTerms].sort()),
    reasons: Object.freeze(
      [...candidate.reasons].sort(
        (left, right) => (REASON_ORDER.get(left) ?? 99) - (REASON_ORDER.get(right) ?? 99),
      ),
    ),
    score: scoreCandidate(candidate),
  });

const withSelectionSignals = (
  selected: SelectedRequirementEvidenceDto,
  candidate: CandidateAccumulator | undefined,
): SelectedRequirementEvidenceDto =>
  Object.freeze({
    ...selected,
    matchedTerms: Object.freeze(candidate === undefined ? [] : [...candidate.matchedTerms].sort()),
    reasons: Object.freeze(
      candidate === undefined
        ? []
        : [...candidate.reasons].sort(
            (left, right) => (REASON_ORDER.get(left) ?? 99) - (REASON_ORDER.get(right) ?? 99),
          ),
    ),
  });

export class RequirementEvidenceRepository implements RequirementEvidencePort {
  public constructor(
    private readonly database: DatabasePort,
    private mode: RequirementEvidenceSearchMode,
    private fallbackReason: RequirementEvidenceFallbackReason | null,
  ) {}

  public async retrieve(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly limit: number;
  }): Promise<RequirementEvidenceRetrievalDto> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
      throw new TypeError("Requirement evidence limit is invalid.");
    }
    const requirement = await readRequirement(this.database, input.requirementId);
    const requirementText = `${requirement.normalized_text} ${requirement.raw_text}`;
    const answerPolicy = classifyApplicationQuestion(requirementText);
    if (answerPolicy.handling === "direct-private-answer") {
      const selectedEvidence = Object.freeze(
        (await readSelections(this.database, input.requirementId)).map((selected) =>
          withSelectionSignals(selected, undefined),
        ),
      );
      return Object.freeze({
        answerPolicy,
        candidates: Object.freeze([]),
        capability: Object.freeze({ mode: this.mode, fallbackReason: this.fallbackReason }),
        coverage: deriveRequirementCoverageDecision({
          category: requirementCategory(requirement.category),
          requirementText,
          requirementRowVersion: requirement.row_version,
          selectedEvidence,
          storedDecision: await readCoverageDecision(this.database, input.requirementId),
        }),
        queryTerms: Object.freeze([]),
        requirementId: entityId("job-requirement", requirement.id),
        selectedEvidence,
      });
    }
    const terms = normalizeRequirementEvidenceTerms(requirementText);
    const contentRows = await loadAllContent(this.database);
    const contentByKey = new Map(
      contentRows.map((row) => [contentKey(evidenceKind(row.evidence_kind), row.evidence_id), row]),
    );
    let matches: readonly EvidenceContentRow[];
    if (this.mode === "fts5") {
      try {
        await rebuildFts(this.database);
        matches = await lexicalRows(this.database, this.mode, terms);
      } catch {
        this.mode = "normalized-token";
        this.fallbackReason = "fts5-query-failed";
        matches = await lexicalRows(this.database, this.mode, terms);
      }
    } else {
      matches = await lexicalRows(this.database, this.mode, terms);
    }

    const accumulators = new Map<string, CandidateAccumulator>();
    const add = (
      row: EvidenceContentRow | undefined,
      reason: RequirementEvidenceReason,
      matchedTerms: readonly string[] = [],
    ): void => {
      if (row === undefined) return;
      const item = mapItem(row);
      const key = contentKey(item.evidenceKind, item.evidenceId);
      const candidate = accumulators.get(key) ?? {
        item,
        matchedTerms: new Set<string>(),
        reasons: new Set<RequirementEvidenceReason>(),
      };
      candidate.reasons.add(reason);
      matchedTerms.forEach((term) => candidate.matchedTerms.add(term));
      accumulators.set(key, candidate);
    };

    for (const row of matches) {
      const haystack = normalizePhrase(`${row.label} ${row.searchable_text}`);
      add(
        row,
        "lexical",
        terms.filter((term) => haystack.includes(term)),
      );
    }

    const skills = await relationRows<SkillRow>(
      this.database,
      "SELECT id, canonical_name, aliases_json FROM skill WHERE archived_at IS NULL ORDER BY id",
    );
    const requirementPhrase = normalizePhrase(
      `${requirement.normalized_text} ${requirement.raw_text}`,
    );
    const exactSkillIds = new Set<string>();
    for (const skill of skills) {
      const aliases = parseStringArray(skill.aliases_json);
      const names = [skill.canonical_name, ...aliases].map(normalizePhrase);
      const exactTerms = names.filter((name) => phraseContains(requirementPhrase, name));
      if (exactTerms.length === 0) continue;
      exactSkillIds.add(skill.id);
      add(contentByKey.get(contentKey("skill", skill.id)), "exact-skill", exactTerms);
    }

    const directKeys = new Set(accumulators.keys());
    const directSkillIds = new Set(
      [...directKeys]
        .filter((key) => key.startsWith("skill:"))
        .map((key) => key.slice("skill:".length)),
    );
    exactSkillIds.forEach((id) => directSkillIds.add(id));

    const skillRelations = await relationRows<SkillRelationRow>(
      this.database,
      "SELECT skill_id, evidence_kind, evidence_id FROM skill_evidence ORDER BY skill_id, evidence_kind, evidence_id",
    );
    for (const relation of skillRelations) {
      if (!directSkillIds.has(relation.skill_id)) continue;
      const kind = evidenceKind(relation.evidence_kind);
      add(contentByKey.get(contentKey(kind, relation.evidence_id)), "skill-relation");
    }

    const storyRelations = await relationRows<StoryRelationRow>(
      this.database,
      "SELECT anecdote_id, evidence_kind, evidence_id FROM anecdote_evidence_link ORDER BY anecdote_id, evidence_kind, evidence_id",
    );
    for (const relation of storyRelations) {
      const kind = evidenceKind(relation.evidence_kind);
      const evidenceKey = contentKey(kind, relation.evidence_id);
      const storyKey = contentKey("story", relation.anecdote_id);
      if (directKeys.has(evidenceKey)) {
        add(contentByKey.get(storyKey), "story-relation");
      }
      if (directKeys.has(storyKey)) {
        add(contentByKey.get(evidenceKey), "story-relation");
      }
    }

    const accomplishments = await relationRows<AccomplishmentRelationRow>(
      this.database,
      "SELECT id, parent_type, parent_id FROM accomplishment WHERE archived_at IS NULL ORDER BY id",
    );
    for (const accomplishment of accomplishments) {
      if (accomplishment.parent_id === null || accomplishment.parent_type === "standalone")
        continue;
      const parentKind =
        accomplishment.parent_type === "volunteer_experience"
          ? "volunteer"
          : accomplishment.parent_type === "experience"
            ? "employment"
            : (accomplishment.parent_type as "education" | "project");
      const accomplishmentKey = contentKey("accomplishment", accomplishment.id);
      const parentKey = contentKey(parentKind, accomplishment.parent_id);
      if (directKeys.has(accomplishmentKey)) {
        add(contentByKey.get(parentKey), "accomplishment-parent");
      }
      if (directKeys.has(parentKey)) {
        add(contentByKey.get(accomplishmentKey), "accomplishment-parent");
      }
    }

    const selectedEvidence = Object.freeze(
      (await readSelections(this.database, input.requirementId)).map((selected) =>
        withSelectionSignals(
          selected,
          accumulators.get(contentKey(selected.evidenceKind, selected.evidenceId)),
        ),
      ),
    );
    const selectedKeys = new Set(
      selectedEvidence.map(({ evidenceKind: kind, evidenceId }) => contentKey(kind, evidenceId)),
    );
    const candidates = [...accumulators.values()]
      .map(toCandidate)
      .filter(
        ({ evidenceKind: kind, evidenceId }) => !selectedKeys.has(contentKey(kind, evidenceId)),
      )
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.evidenceKind.localeCompare(right.evidenceKind) ||
          left.label.localeCompare(right.label) ||
          left.evidenceId.localeCompare(right.evidenceId),
      )
      .slice(0, input.limit);

    return Object.freeze({
      answerPolicy,
      candidates: Object.freeze(candidates),
      capability: Object.freeze({ mode: this.mode, fallbackReason: this.fallbackReason }),
      coverage: deriveRequirementCoverageDecision({
        category: requirementCategory(requirement.category),
        requirementText,
        requirementRowVersion: requirement.row_version,
        selectedEvidence,
        storedDecision: await readCoverageDecision(this.database, input.requirementId),
      }),
      queryTerms: terms,
      requirementId: entityId("job-requirement", requirement.id),
      selectedEvidence,
    });
  }

  public async select(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly evidenceKind: RequirementEvidenceKind;
    readonly evidenceId: EntityId;
    readonly selectedAt: string;
  }): Promise<SelectedRequirementEvidenceDto> {
    const kind = evidenceKind(input.evidenceKind);
    instant(input.selectedAt);
    return this.database.transaction(async (transaction) => {
      const requirement = await readRequirement(transaction, input.requirementId);
      if (
        classifyApplicationQuestion(`${requirement.normalized_text} ${requirement.raw_text}`)
          .handling === "direct-private-answer"
      ) {
        throw new TypeError("Private application answers cannot use inferred evidence.");
      }
      const targetRows = await transaction.query<EvidenceContentRow>(
        sqlStatement(
          `SELECT evidence_kind, evidence_id, label, searchable_text, verification_state,
                  privacy_tags_json, updated_at
           FROM career_evidence_search_content
           WHERE evidence_kind = ? AND evidence_id = ?`,
          [kind, input.evidenceId],
        ),
      );
      if (targetRows.length !== 1) throw new TypeError("Evidence selection target is missing.");
      const existing = await readSelections(transaction, input.requirementId);
      const existingSelection = existing.find(
        ({ evidenceKind: existingKind, evidenceId }) =>
          existingKind === kind && evidenceId === input.evidenceId,
      );
      if (existingSelection !== undefined) return existingSelection;
      if (existing.length >= REQUIREMENT_EVIDENCE_LIMITS.selectionsPerRequirement) {
        throw new TypeError("Requirement evidence selection limit is reached.");
      }
      const target = TARGET_BY_KIND[kind];
      const targetColumns = Object.values(TARGET_BY_KIND).map(({ column }) => column);
      const parameters: SqlValue[] = [input.requirementId, kind, input.evidenceId];
      parameters.push(
        ...targetColumns.map((column) => (column === target.column ? input.evidenceId : null)),
      );
      parameters.push(input.selectedAt);
      const result = await transaction.execute(
        sqlStatement(
          `INSERT INTO job_requirement_evidence_selection(${SELECTION_COLUMNS.join(", ")})
           VALUES (${SELECTION_COLUMNS.map(() => "?").join(", ")})`,
          parameters,
        ),
      );
      if (result.rowsAffected !== 1) throw new Error("Requirement evidence selection failed.");
      const stored = await readSelections(transaction, input.requirementId);
      const selected = stored.find(
        ({ evidenceKind: storedKind, evidenceId }) =>
          storedKind === kind && evidenceId === input.evidenceId,
      );
      if (selected === undefined) {
        throw new Error("Stored requirement evidence selection is missing.");
      }
      return selected;
    });
  }

  public async remove(input: {
    readonly requirementId: EntityId<"job-requirement">;
    readonly evidenceKind: RequirementEvidenceKind;
    readonly evidenceId: EntityId;
  }): Promise<boolean> {
    const result = await this.database.execute(
      sqlStatement(
        `DELETE FROM job_requirement_evidence_selection
         WHERE requirement_id = ? AND evidence_kind = ? AND evidence_id = ?`,
        [input.requirementId, evidenceKind(input.evidenceKind), input.evidenceId],
      ),
    );
    return result.rowsAffected === 1;
  }

  public async setCoverageDecision(input: {
    readonly decidedAt: string;
    readonly expectedRowVersion: number | null;
    readonly requirementId: EntityId<"job-requirement">;
    readonly state: RequirementCoverageState;
  }): Promise<RequirementCoverageDecisionDto> {
    const decidedAt = instant(input.decidedAt);
    const state = requirementCoverageState(input.state);
    if (
      input.expectedRowVersion !== null &&
      (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 1)
    ) {
      throw new TypeError("Expected requirement coverage row version is invalid.");
    }

    return this.database.transaction(async (transaction) => {
      const requirement = await readRequirement(transaction, input.requirementId);
      const requirementText = `${requirement.normalized_text} ${requirement.raw_text}`;
      if (classifyApplicationQuestion(requirementText).handling === "direct-private-answer") {
        throw new TypeError("Private application answers cannot use inferred coverage.");
      }
      const selectedEvidence = await readSelections(transaction, input.requirementId);
      if ((state === "strength" || state === "partial") && selectedEvidence.length === 0) {
        throw new TypeError("Strength and Partial coverage require selected evidence.");
      }
      const current = await readCoverageDecision(transaction, input.requirementId);
      if (
        (current === null && input.expectedRowVersion !== null) ||
        (current !== null && current.rowVersion !== input.expectedRowVersion)
      ) {
        throw new RequirementEvidenceError("conflict");
      }
      const selectionBasis = requirementCoverageSelectionBasis(selectedEvidence);
      if (current === null) {
        const inserted = await transaction.execute(
          sqlStatement(
            `INSERT INTO job_requirement_coverage_decision(
               requirement_id, coverage_state, requirement_row_version, selection_basis,
               decided_at, updated_at, row_version
             ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [
              input.requirementId,
              state,
              requirement.row_version,
              selectionBasis,
              decidedAt,
              decidedAt,
            ],
          ),
        );
        if (inserted.rowsAffected !== 1) {
          throw new RequirementEvidenceError("conflict");
        }
      } else {
        const updated = await transaction.execute(
          sqlStatement(
            `UPDATE job_requirement_coverage_decision
             SET coverage_state = ?, requirement_row_version = ?, selection_basis = ?,
                 decided_at = ?, updated_at = ?, row_version = row_version + 1
             WHERE requirement_id = ? AND row_version = ?`,
            [
              state,
              requirement.row_version,
              selectionBasis,
              decidedAt,
              decidedAt,
              input.requirementId,
              current.rowVersion,
            ],
          ),
        );
        if (updated.rowsAffected !== 1) {
          throw new RequirementEvidenceError("conflict");
        }
      }
      const storedDecision = await readCoverageDecision(transaction, input.requirementId);
      if (storedDecision === null)
        throw new Error("Stored requirement coverage decision is missing.");
      return deriveRequirementCoverageDecision({
        category: requirementCategory(requirement.category),
        requirementText,
        requirementRowVersion: requirement.row_version,
        selectedEvidence,
        storedDecision,
      });
    });
  }

  public async resetCoverageDecision(input: {
    readonly expectedRowVersion: number;
    readonly requirementId: EntityId<"job-requirement">;
  }): Promise<RequirementCoverageDecisionDto> {
    if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
      throw new TypeError("Expected requirement coverage row version is invalid.");
    }
    await this.database.transaction(async (transaction) => {
      await readRequirement(transaction, input.requirementId);
      const deleted = await transaction.execute(
        sqlStatement(
          `DELETE FROM job_requirement_coverage_decision
           WHERE requirement_id = ? AND row_version = ?`,
          [input.requirementId, input.expectedRowVersion],
        ),
      );
      if (deleted.rowsAffected !== 1) throw new RequirementEvidenceError("conflict");
    });
    return (await this.retrieve({ requirementId: input.requirementId, limit: 1 })).coverage;
  }
}

export const openRequirementEvidenceRepository = async (
  database: DatabasePort,
  options: OpenRequirementEvidenceRepositoryOptions = {},
): Promise<RequirementEvidenceRepository> => {
  await database.query(
    sqlStatement("SELECT evidence_kind FROM career_evidence_search_content LIMIT 1"),
  );
  if (options.disableFts5 === true) {
    return new RequirementEvidenceRepository(database, "normalized-token", "policy-disabled");
  }
  if (!(await detectFts5(database))) {
    return new RequirementEvidenceRepository(database, "normalized-token", "module-unavailable");
  }
  try {
    await rebuildFts(database);
    return new RequirementEvidenceRepository(database, "fts5", null);
  } catch {
    return new RequirementEvidenceRepository(
      database,
      "normalized-token",
      "fts5-initialization-failed",
    );
  }
};
