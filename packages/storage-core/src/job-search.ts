import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";

export const JOB_SEARCH_LIMITS = Object.freeze({
  maximumQueryCharacters: 512,
  maximumResults: 100,
  maximumTokenCharacters: 64,
  maximumTokens: 16,
});

export type JobSearchMode = "fts5" | "normalized-token";
export type JobSearchFallbackReason =
  "fts5-initialization-failed" | "fts5-query-failed" | "module-unavailable" | "policy-disabled";

export interface JobSearchCapability {
  readonly mode: JobSearchMode;
  readonly runtimeProbe: "temporary-virtual-table" | "disabled";
  readonly fallbackReason: JobSearchFallbackReason | null;
}

export interface JobSearchInput {
  readonly query: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
}

export interface JobSearchResult {
  readonly jobId: string;
  readonly title: string;
  readonly companyName: string | null;
  readonly updatedAt: string;
}

export interface JobSearchResponse {
  readonly capability: JobSearchCapability;
  readonly normalizedTokens: readonly string[];
  readonly results: readonly JobSearchResult[];
}

export interface OpenJobSearchOptions {
  /** A reviewed operational/test escape hatch that never attempts FTS5 SQL. */
  readonly disableFts5?: boolean;
}

type SearchRow = QueryRow & {
  readonly job_id: string;
  readonly title: string;
  readonly company_name: string;
  readonly updated_at: string;
};

type SearchStateRow = QueryRow & {
  readonly content_revision: number;
  readonly fts_revision: number | null;
  readonly fts_schema_version: number | null;
};

type CountRow = QueryRow & { readonly total: number };

const FTS_SCHEMA_VERSION = 1;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const SEARCH_COLUMNS_SQL = `
  search_content.job_id,
  search_content.title,
  search_content.company_name,
  search_content.updated_at
`;

const CREATE_FTS_SQL = sqlStatement(`
  CREATE VIRTUAL TABLE job_search_fts USING fts5(
    title,
    normalized_title,
    company_name,
    description_text,
    company_notes,
    application_notes,
    content='job_search_content',
    content_rowid='search_id',
    tokenize='unicode61 remove_diacritics 2'
  )
`);
const DROP_FTS_SQL = sqlStatement("DROP TABLE IF EXISTS job_search_fts");
const REBUILD_FTS_SQL = sqlStatement(
  "INSERT INTO job_search_fts(job_search_fts) VALUES ('rebuild')",
);
const SEARCH_STATE_SQL = sqlStatement(`
  SELECT content_revision, fts_schema_version, fts_revision
  FROM job_search_state WHERE singleton = 1
`);
const FTS_TABLE_EXISTS_SQL = sqlStatement(
  "SELECT count(*) AS total FROM sqlite_schema WHERE type = 'table' AND name = 'job_search_fts'",
);
const FALLBACK_SMOKE_SQL = sqlStatement("SELECT search_id FROM job_search_content LIMIT 0");

const immutableCapability = (
  mode: JobSearchMode,
  runtimeProbe: JobSearchCapability["runtimeProbe"],
  fallbackReason: JobSearchFallbackReason | null,
): JobSearchCapability => Object.freeze({ mode, runtimeProbe, fallbackReason });

const readSearchState = async (database: DatabasePort): Promise<SearchStateRow> => {
  const rows = await database.query<SearchStateRow>(SEARCH_STATE_SQL);
  const state = rows[0];
  if (
    rows.length !== 1 ||
    state === undefined ||
    !Number.isSafeInteger(state.content_revision) ||
    state.content_revision <= 0 ||
    (state.fts_schema_version !== null &&
      (!Number.isSafeInteger(state.fts_schema_version) || state.fts_schema_version <= 0)) ||
    (state.fts_revision !== null &&
      (!Number.isSafeInteger(state.fts_revision) ||
        state.fts_revision <= 0 ||
        state.fts_revision > state.content_revision))
  ) {
    throw new Error("The job-search revision state is invalid.");
  }
  return state;
};

const ftsTableExists = async (database: DatabasePort): Promise<boolean> => {
  const rows = await database.query<CountRow>(FTS_TABLE_EXISTS_SQL);
  const total = rows[0]?.total;
  if (rows.length !== 1 || (total !== 0 && total !== 1)) {
    throw new Error("The job-search FTS schema inventory is invalid.");
  }
  return total === 1;
};

export const normalizeJobSearchTokens = (query: string): readonly string[] => {
  if (
    typeof query !== "string" ||
    query.length > JOB_SEARCH_LIMITS.maximumQueryCharacters ||
    query.includes("\u0000")
  ) {
    throw new TypeError("Job-search text must be bounded text without NUL characters.");
  }
  const tokens = query.normalize("NFKC").toLowerCase().match(TOKEN_PATTERN);
  if (tokens === null) return Object.freeze([]);
  if (tokens.some((token) => token.length > JOB_SEARCH_LIMITS.maximumTokenCharacters)) {
    throw new TypeError("Job-search text contains an oversized token.");
  }
  const unique = [...new Set(tokens)];
  if (unique.length > JOB_SEARCH_LIMITS.maximumTokens) {
    throw new TypeError("Job-search text contains too many tokens.");
  }
  return Object.freeze(unique);
};

const resultLimit = (value: number | undefined): number => {
  const limit = value ?? 50;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > JOB_SEARCH_LIMITS.maximumResults) {
    throw new TypeError("Job-search result limit is outside the reviewed range.");
  }
  return limit;
};

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const ftsQuery = (tokens: readonly string[]): string =>
  tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");

const mapSearchRows = (rows: readonly SearchRow[]): readonly JobSearchResult[] =>
  Object.freeze(
    rows.map((row) => {
      if (
        typeof row.job_id !== "string" ||
        typeof row.title !== "string" ||
        typeof row.company_name !== "string" ||
        typeof row.updated_at !== "string"
      ) {
        throw new Error("Stored job-search output is invalid.");
      }
      return Object.freeze({
        jobId: row.job_id,
        title: row.title,
        companyName: row.company_name.length === 0 ? null : row.company_name,
        updatedAt: row.updated_at,
      });
    }),
  );

const detectFts5 = async (database: DatabasePort): Promise<boolean> => {
  try {
    await database.execute(
      sqlStatement("CREATE VIRTUAL TABLE temp.coredrill_fts5_probe USING fts5(token)"),
    );
    await database.execute(sqlStatement("DROP TABLE temp.coredrill_fts5_probe"));
    return true;
  } catch {
    try {
      await database.execute(sqlStatement("DROP TABLE IF EXISTS temp.coredrill_fts5_probe"));
    } catch {
      // The failed capability probe must not replace the functional fallback.
    }
    return false;
  }
};

const synchronizeFts = async (database: DatabasePort): Promise<void> => {
  const state = await readSearchState(database);
  const exists = await ftsTableExists(database);
  if (
    exists &&
    state.fts_schema_version === FTS_SCHEMA_VERSION &&
    state.fts_revision === state.content_revision
  ) {
    return;
  }

  await database.transaction(async (transaction) => {
    if (!exists || state.fts_schema_version !== FTS_SCHEMA_VERSION) {
      await transaction.execute(DROP_FTS_SQL);
      await transaction.execute(CREATE_FTS_SQL);
    }
    await transaction.execute(REBUILD_FTS_SQL);
    await transaction.execute(
      sqlStatement(
        `UPDATE job_search_state
         SET fts_schema_version = ?, fts_revision = content_revision
         WHERE singleton = 1`,
        [FTS_SCHEMA_VERSION],
      ),
    );
  });
};

const fallbackRows = async (
  database: DatabasePort,
  tokens: readonly string[],
  includeArchived: boolean,
  limit: number,
): Promise<readonly SearchRow[]> => {
  const searchable = `lower(
    search_content.title || char(31) ||
    search_content.normalized_title || char(31) ||
    search_content.company_name || char(31) ||
    search_content.description_text || char(31) ||
    search_content.company_notes || char(31) ||
    search_content.application_notes
  )`;
  const predicates = tokens.map(() => `${searchable} LIKE ? ESCAPE '\\'`);
  const archivePredicate = includeArchived ? "1 = 1" : "search_content.archived_at IS NULL";
  return database.query<SearchRow>(
    sqlStatement(
      `SELECT ${SEARCH_COLUMNS_SQL}
       FROM job_search_content AS search_content
       WHERE ${archivePredicate} AND ${predicates.join(" AND ")}
       ORDER BY search_content.updated_at DESC, search_content.job_id
       LIMIT ?`,
      [...tokens.map((token) => `%${escapeLike(token)}%`), limit],
    ),
  );
};

export class JobSearchRepository {
  public constructor(
    private readonly database: DatabasePort,
    private capabilityState: JobSearchCapability,
  ) {}

  public get capability(): JobSearchCapability {
    return this.capabilityState;
  }

  public async search(input: JobSearchInput): Promise<JobSearchResponse> {
    const tokens = normalizeJobSearchTokens(input.query);
    const limit = resultLimit(input.limit);
    if (tokens.length === 0) {
      return Object.freeze({
        capability: this.capabilityState,
        normalizedTokens: tokens,
        results: Object.freeze([]),
      });
    }

    let rows: readonly SearchRow[];
    if (this.capabilityState.mode === "fts5") {
      try {
        await synchronizeFts(this.database);
        const archivePredicate =
          input.includeArchived === true ? "1 = 1" : "search_content.archived_at IS NULL";
        rows = await this.database.query<SearchRow>(
          sqlStatement(
            `SELECT ${SEARCH_COLUMNS_SQL}
             FROM job_search_fts
             INNER JOIN job_search_content AS search_content
               ON search_content.search_id = job_search_fts.rowid
             WHERE job_search_fts MATCH ? AND ${archivePredicate}
             ORDER BY search_content.updated_at DESC, search_content.job_id
             LIMIT ?`,
            [ftsQuery(tokens), limit],
          ),
        );
      } catch {
        await this.database.query(FALLBACK_SMOKE_SQL);
        this.capabilityState = immutableCapability(
          "normalized-token",
          "temporary-virtual-table",
          "fts5-query-failed",
        );
        rows = await fallbackRows(this.database, tokens, input.includeArchived === true, limit);
      }
    } else {
      rows = await fallbackRows(this.database, tokens, input.includeArchived === true, limit);
    }

    return Object.freeze({
      capability: this.capabilityState,
      normalizedTokens: tokens,
      results: mapSearchRows(rows),
    });
  }
}

export const openJobSearchRepository = async (
  database: DatabasePort,
  options: OpenJobSearchOptions = {},
): Promise<JobSearchRepository> => {
  await readSearchState(database);
  if (options.disableFts5 === true) {
    return new JobSearchRepository(
      database,
      immutableCapability("normalized-token", "disabled", "policy-disabled"),
    );
  }
  if (!(await detectFts5(database))) {
    return new JobSearchRepository(
      database,
      immutableCapability("normalized-token", "temporary-virtual-table", "module-unavailable"),
    );
  }
  try {
    await synchronizeFts(database);
    return new JobSearchRepository(
      database,
      immutableCapability("fts5", "temporary-virtual-table", null),
    );
  } catch {
    await database.query(FALLBACK_SMOKE_SQL);
    return new JobSearchRepository(
      database,
      immutableCapability(
        "normalized-token",
        "temporary-virtual-table",
        "fts5-initialization-failed",
      ),
    );
  }
};
