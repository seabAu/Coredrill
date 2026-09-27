import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { createCareerRepositories, type NewCareerStory } from "./career-repositories.js";
import type { CareerStoryRecord } from "./career-records.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type QueryRow,
  type SqlValue,
} from "./database-port.js";

export const CAREER_STORY_EVIDENCE_KINDS = Object.freeze([
  "employment",
  "education",
  "project",
  "skill",
  "accomplishment",
  "certification",
  "publication",
  "volunteer",
] as const);
export type CareerStoryEvidenceKind = (typeof CAREER_STORY_EVIDENCE_KINDS)[number];

export interface CareerStoryEvidenceLinkInput {
  readonly evidenceId: EntityId;
  readonly evidenceKind: CareerStoryEvidenceKind;
}

export interface CareerStoryEvidenceLinkRecord extends CareerStoryEvidenceLinkInput {
  readonly createdAt: Instant;
  readonly storyId: EntityId<"anecdote">;
}

export interface CareerStoryWithEvidence extends CareerStoryRecord {
  readonly linkedEvidence: readonly CareerStoryEvidenceLinkRecord[];
}

export interface UpdateCareerStoryRecordInput {
  readonly id: EntityId<"anecdote">;
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags: readonly string[];
  readonly privacyTags: readonly string[];
  readonly expectedRowVersion: number;
  readonly updatedAt: Instant;
}

interface EvidenceLinkRow extends QueryRow {
  readonly anecdote_id: string;
  readonly evidence_kind: string;
  readonly evidence_id: string;
  readonly created_at: string;
}

const PRIVACY_TAG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const TARGET_BY_KIND = Object.freeze({
  employment: Object.freeze({ column: "experience_id", entity: "experience", table: "experience" }),
  education: Object.freeze({ column: "education_id", entity: "education", table: "education" }),
  project: Object.freeze({ column: "project_id", entity: "project", table: "project" }),
  skill: Object.freeze({ column: "skill_id", entity: "skill", table: "skill" }),
  accomplishment: Object.freeze({
    column: "accomplishment_id",
    entity: "accomplishment",
    table: "accomplishment",
  }),
  certification: Object.freeze({
    column: "certification_id",
    entity: "certification",
    table: "certification",
  }),
  publication: Object.freeze({
    column: "publication_id",
    entity: "publication",
    table: "publication",
  }),
  volunteer: Object.freeze({
    column: "volunteer_experience_id",
    entity: "volunteer-experience",
    table: "volunteer_experience",
  }),
} as const);

const evidenceKind = (value: string): CareerStoryEvidenceKind => {
  if (!CAREER_STORY_EVIDENCE_KINDS.includes(value as CareerStoryEvidenceKind)) {
    throw new Error("Stored career-story evidence kind is invalid.");
  }
  return value as CareerStoryEvidenceKind;
};

const requiredText = (value: unknown, label: string, maximum: number): string => {
  if (typeof value !== "string" || value.includes("\u0000") || value.length > maximum) {
    throw new TypeError(`${label} must be bounded text without NUL characters.`);
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new TypeError(`${label} is required.`);
  return cleaned;
};

const serializeTags = (value: unknown): string => {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new TypeError("Career story tags must be a bounded string array.");
  }
  const normalized = (value as readonly string[]).map((item) =>
    requiredText(item, "Career story tag", 512),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("Career story tags cannot contain duplicates.");
  }
  const serialized = JSON.stringify(normalized);
  if (serialized.length > 20_000)
    throw new TypeError("Career story tags exceed their storage limit.");
  return serialized;
};

const serializePrivacyTags = (value: unknown): string => {
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    value.some(
      (item) => typeof item !== "string" || item.length > 64 || !PRIVACY_TAG_PATTERN.test(item),
    )
  ) {
    throw new TypeError(
      "Career story privacy tags must be at most 16 lowercase content-free identifiers.",
    );
  }
  const normalized = [...(value as readonly string[])].sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError("Career story privacy tags cannot contain duplicates.");
  }
  return JSON.stringify(normalized);
};

const normalizeLinks = (
  links: readonly CareerStoryEvidenceLinkInput[],
): readonly CareerStoryEvidenceLinkInput[] => {
  if (!Array.isArray(links) || links.length > 64) {
    throw new TypeError("A career story can link at most 64 evidence records.");
  }
  const normalized = (links as readonly unknown[]).map((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      throw new TypeError("Career story evidence links must be records.");
    }
    const link = candidate as Record<string, unknown>;
    const kind = evidenceKind(requiredText(link["evidenceKind"], "Evidence kind", 64));
    const target = TARGET_BY_KIND[kind];
    return Object.freeze({
      evidenceKind: kind,
      evidenceId: entityId(target.entity, requiredText(link["evidenceId"], "Evidence id", 512)),
    });
  });
  const keys = normalized.map(({ evidenceId, evidenceKind: kind }) => `${kind}:${evidenceId}`);
  if (new Set(keys).size !== keys.length) {
    throw new TypeError("Career story evidence links cannot contain duplicates.");
  }
  normalized.sort(
    (left, right) =>
      left.evidenceKind.localeCompare(right.evidenceKind) ||
      left.evidenceId.localeCompare(right.evidenceId),
  );
  return Object.freeze(normalized);
};

const mapLink = (row: EvidenceLinkRow): CareerStoryEvidenceLinkRecord => {
  const kind = evidenceKind(row.evidence_kind);
  return Object.freeze({
    storyId: entityId("anecdote", row.anecdote_id),
    evidenceKind: kind,
    evidenceId: entityId(TARGET_BY_KIND[kind].entity, row.evidence_id),
    createdAt: instant(row.created_at),
  });
};

const listLinks = async (
  session: DatabaseTransaction | DatabasePort,
): Promise<readonly CareerStoryEvidenceLinkRecord[]> => {
  const rows = await session.query<EvidenceLinkRow>(
    sqlStatement(
      "SELECT anecdote_id, evidence_kind, evidence_id, created_at FROM anecdote_evidence_link ORDER BY anecdote_id, evidence_kind, evidence_id",
    ),
  );
  return Object.freeze(rows.map(mapLink));
};

const insertLinks = async (
  transaction: DatabaseTransaction,
  storyId: EntityId<"anecdote">,
  links: readonly CareerStoryEvidenceLinkInput[],
  createdAt: Instant,
): Promise<void> => {
  for (const link of normalizeLinks(links)) {
    const target = TARGET_BY_KIND[link.evidenceKind];
    const active = await transaction.query(
      sqlStatement(`SELECT id FROM ${target.table} WHERE id = ? AND archived_at IS NULL`, [
        link.evidenceId,
      ]),
    );
    if (active.length !== 1) {
      throw new TypeError("Career story links require existing active evidence.");
    }
    const columns = [
      "anecdote_id",
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
      "created_at",
    ];
    const targetColumns = Object.values(TARGET_BY_KIND).map(({ column }) => column);
    const values: SqlValue[] = [storyId, link.evidenceKind, link.evidenceId];
    values.push(
      ...targetColumns.map((column) => (column === target.column ? link.evidenceId : null)),
    );
    values.push(createdAt);
    const result = await transaction.execute(
      sqlStatement(
        `INSERT INTO anecdote_evidence_link(${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        values,
      ),
    );
    if (result.rowsAffected !== 1) throw new Error("Career story evidence link insert failed.");
  }
};

const combine = (
  stories: readonly CareerStoryRecord[],
  links: readonly CareerStoryEvidenceLinkRecord[],
): readonly CareerStoryWithEvidence[] => {
  const byStory = new Map<string, CareerStoryEvidenceLinkRecord[]>();
  for (const link of links) {
    const existing = byStory.get(link.storyId) ?? [];
    existing.push(link);
    byStory.set(link.storyId, existing);
  }
  return Object.freeze(
    stories.map((story) =>
      Object.freeze({
        ...story,
        linkedEvidence: Object.freeze([...(byStory.get(story.id) ?? [])]),
      }),
    ),
  );
};

export class CareerStoryEvidenceRepository {
  readonly #database: DatabasePort;

  public constructor(database: DatabasePort) {
    this.#database = database;
  }

  public async create(
    story: NewCareerStory,
    evidenceLinks: readonly CareerStoryEvidenceLinkInput[],
  ): Promise<CareerStoryWithEvidence> {
    return this.#database.transaction(async (transaction) => {
      const stored = await createCareerRepositories(transaction).stories.insert(story);
      await insertLinks(transaction, stored.id, evidenceLinks, stored.createdAt);
      const links = (await listLinks(transaction)).filter(({ storyId }) => storyId === stored.id);
      const combined = combine([stored], links)[0];
      if (combined === undefined) throw new Error("Created career story is missing.");
      return combined;
    });
  }

  public async update(
    input: UpdateCareerStoryRecordInput,
    evidenceLinks: readonly CareerStoryEvidenceLinkInput[],
  ): Promise<CareerStoryWithEvidence> {
    if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
      throw new TypeError("Career story update requires a positive row version.");
    }
    instant(input.updatedAt);
    const title = requiredText(input.title, "Career story title", 512);
    const situation = requiredText(input.situation, "Career story situation", 20_000);
    const action = requiredText(input.action, "Career story action", 20_000);
    const resultText = requiredText(input.result, "Career story result", 20_000);
    const tags = serializeTags(input.tags);
    const privacyTags = serializePrivacyTags(input.privacyTags);
    const normalizedLinks = normalizeLinks(evidenceLinks);

    return this.#database.transaction(async (transaction) => {
      const existing = await createCareerRepositories(transaction).stories.findById(input.id);
      if (existing?.archivedAt !== null) {
        throw new Error("Career story update target is missing.");
      }
      if (existing.rowVersion !== input.expectedRowVersion) {
        throw new Error("Career story update target is stale.");
      }
      const update = await transaction.execute(
        sqlStatement(
          "UPDATE anecdote SET title = ?, situation = ?, action = ?, result = ?, tags_json = ?, privacy_tags_json = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND archived_at IS NULL AND row_version = ?",
          [
            title,
            situation,
            action,
            resultText,
            tags,
            privacyTags,
            input.updatedAt,
            input.id,
            input.expectedRowVersion,
          ],
        ),
      );
      if (update.rowsAffected !== 1) throw new Error("Career story update target is stale.");
      await transaction.execute(
        sqlStatement("DELETE FROM anecdote_evidence_link WHERE anecdote_id = ?", [input.id]),
      );
      await insertLinks(transaction, input.id, normalizedLinks, input.updatedAt);
      const stored = await createCareerRepositories(transaction).stories.findById(input.id);
      if (stored === null) throw new Error("Updated career story is missing.");
      const links = (await listLinks(transaction)).filter(({ storyId }) => storyId === input.id);
      const combined = combine([stored], links)[0];
      if (combined === undefined) throw new Error("Updated career story is missing.");
      return combined;
    });
  }

  public async listActive(): Promise<readonly CareerStoryWithEvidence[]> {
    const repositories = createCareerRepositories(this.#database);
    return combine(await repositories.stories.listActive(), await listLinks(this.#database));
  }
}

export const createCareerStoryRepository = (
  database: DatabasePort,
): CareerStoryEvidenceRepository => new CareerStoryEvidenceRepository(database);
