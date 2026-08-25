import { openBrowserSqliteDatabase } from "@coredrill/storage-browser";
import {
  applySqlMigrations,
  openJobSearchRepository,
  sqlStatement,
  type SqlMigration,
} from "@coredrill/storage-core";

const BENCHMARK_DATABASE_NAME = "/coredrill-benchmark.sqlite3";
const SEARCH_WARMUPS = 5;
const SEARCH_RUNS = 50;
const STARTUP_RUNS = 20;
const EXPORT_RUNS = 5;
const RESTORE_RUNS = 3;
const INSERT_BATCH_SIZE = 100;

interface BenchmarkRow {
  readonly id: number;
  readonly normalizedTitle: string;
  readonly title: string;
  readonly description: string;
}

export interface StorageBenchmarkInput {
  readonly descriptionBytesPerRecord: number;
  readonly fixtureId: string;
  readonly profileId: string;
  readonly records: number;
  readonly seed: string;
}

export interface BenchmarkMetric {
  readonly failures: number;
  readonly maximumMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly rawMs: readonly number[];
}

export interface StorageBenchmarkResult {
  readonly byteLength: number;
  readonly completedAt: string;
  readonly fixtureId: string;
  readonly fixtureSha256: string;
  readonly metrics: Readonly<{
    create: BenchmarkMetric;
    export: BenchmarkMetric;
    import: BenchmarkMetric;
    migrate: BenchmarkMetric;
    restore: BenchmarkMetric;
    search: BenchmarkMetric;
    startup: BenchmarkMetric;
  }>;
  readonly profileId: string;
  readonly records: number;
  readonly seed: string;
  readonly startedAt: string;
}

export interface JobSearchBenchmarkResult {
  readonly byteLength: number;
  readonly completedAt: string;
  readonly fixtureId: string;
  readonly fixtureSha256: string;
  readonly metrics: Readonly<{
    fallbackSearch: BenchmarkMetric;
    ftsInitialize: BenchmarkMetric;
    ftsSearch: BenchmarkMetric;
    import: BenchmarkMetric;
    migrate: BenchmarkMetric;
  }>;
  readonly profileId: string;
  readonly records: number;
  readonly searchModes: readonly ["fts5", "normalized-token"];
  readonly seed: string;
  readonly startedAt: string;
}

const roundMilliseconds = (value: number): number => Math.round(value * 1_000) / 1_000;

const percentile = (sorted: readonly number[], ratio: number): number => {
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
};

const metric = (raw: readonly number[], failures = 0): BenchmarkMetric => {
  const rounded = raw.map(roundMilliseconds);
  const sorted = [...rounded].sort((left, right) => left - right);
  return Object.freeze({
    failures,
    maximumMs: sorted.at(-1) ?? 0,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    rawMs: Object.freeze(rounded),
  });
};

const measured = async <Result>(work: () => Promise<Result>): Promise<[Result, number]> => {
  const started = performance.now();
  const result = await work();
  return [result, performance.now() - started];
};

const createRows = (input: StorageBenchmarkInput): readonly BenchmarkRow[] => {
  if (!Number.isSafeInteger(input.records) || input.records <= 0 || input.records > 10_000) {
    throw new TypeError("Storage benchmark record count is outside the reviewed range.");
  }
  if (
    !Number.isSafeInteger(input.descriptionBytesPerRecord) ||
    input.descriptionBytesPerRecord < 64 ||
    input.descriptionBytesPerRecord > 4_096
  ) {
    throw new TypeError("Storage benchmark description size is outside the reviewed range.");
  }
  const rows = Array.from({ length: input.records }, (_, index) => {
    const id = index + 1;
    const token = id % 257;
    const prefix = `${input.seed}|${input.profileId}|${String(id)}|`;
    const description = prefix.padEnd(input.descriptionBytesPerRecord, String(token % 10));
    return Object.freeze({
      id,
      normalizedTitle: `software-engineer-${String(token).padStart(3, "0")}`,
      title: `Software Engineer ${String(token).padStart(3, "0")}`,
      description,
    });
  });
  return Object.freeze(rows);
};

const sha256Text = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const insertBatch = async (
  database: Awaited<ReturnType<typeof openBrowserSqliteDatabase>>,
  rows: readonly BenchmarkRow[],
): Promise<void> => {
  await database.transaction(async (transaction) => {
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
      const placeholders = batch.map(() => "(?, ?, ?, ?)").join(", ");
      await transaction.execute(
        sqlStatement(
          `INSERT INTO storage_benchmark_record(id, title, normalized_title, description) VALUES ${placeholders}`,
          batch.flatMap((row) => [row.id, row.title, row.normalizedTitle, row.description]),
        ),
      );
    }
  });
};

export const runStorageBenchmark = async (
  input: StorageBenchmarkInput,
): Promise<StorageBenchmarkResult> => {
  const startedAt = new Date().toISOString();
  const rows = createRows(input);
  const fixtureSha256 = await sha256Text(
    rows
      .map((row) =>
        [row.id, row.title, row.normalizedTitle, row.description].map(String).join("\u001f"),
      )
      .join("\n"),
  );

  let database = await openBrowserSqliteDatabase({ databaseName: BENCHMARK_DATABASE_NAME });
  await database.delete();
  const [createdDatabase, createDuration] = await measured(() =>
    openBrowserSqliteDatabase({ databaseName: BENCHMARK_DATABASE_NAME }),
  );
  database = createdDatabase;
  const createMs = [createDuration];

  const [, migrateMs] = await measured(() =>
    database.transaction(async (transaction) => {
      await transaction.execute(
        sqlStatement(`
          CREATE TABLE storage_benchmark_record (
            id INTEGER PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            normalized_title TEXT NOT NULL,
            description TEXT NOT NULL
          ) STRICT
        `),
      );
      await transaction.execute(
        sqlStatement(
          "CREATE INDEX storage_benchmark_title_idx ON storage_benchmark_record(normalized_title)",
        ),
      );
    }),
  );

  const [, importMs] = await measured(() => insertBatch(database, rows));
  const searchRaw: number[] = [];
  for (let run = 0; run < SEARCH_WARMUPS + SEARCH_RUNS; run += 1) {
    const token = (run * 37) % 257;
    const [, searchMs] = await measured(() =>
      database.query(
        sqlStatement(
          "SELECT id, title FROM storage_benchmark_record WHERE normalized_title = ? ORDER BY id LIMIT 50",
          [`software-engineer-${String(token).padStart(3, "0")}`],
        ),
      ),
    );
    if (run >= SEARCH_WARMUPS) searchRaw.push(searchMs);
  }

  const exportRaw: number[] = [];
  let portable = await database.exportPortable();
  for (let run = 0; run < EXPORT_RUNS; run += 1) {
    const [nextPortable, exportMs] = await measured(() => database.exportPortable());
    portable = nextPortable;
    exportRaw.push(exportMs);
  }

  const restoreRaw: number[] = [];
  for (let run = 0; run < RESTORE_RUNS; run += 1) {
    const [, restoreMs] = await measured(() => database.restorePortable(portable));
    restoreRaw.push(restoreMs);
  }

  await database.close();
  const startupRaw: number[] = [];
  for (let run = 0; run < STARTUP_RUNS; run += 1) {
    const [reopened, startupMs] = await measured(() =>
      openBrowserSqliteDatabase({
        databaseName: BENCHMARK_DATABASE_NAME,
        expectedExisting: true,
      }),
    );
    startupRaw.push(startupMs);
    database = reopened;
    await database.close();
  }

  database = await openBrowserSqliteDatabase({
    databaseName: BENCHMARK_DATABASE_NAME,
    expectedExisting: true,
  });
  const countRows = await database.query<{ readonly count: number }>(
    sqlStatement("SELECT COUNT(*) AS count FROM storage_benchmark_record"),
  );
  if (countRows[0]?.count !== input.records) {
    throw new Error("Storage benchmark record count changed during measurement.");
  }
  await database.delete();

  return Object.freeze({
    byteLength: portable.byteLength,
    completedAt: new Date().toISOString(),
    fixtureId: input.fixtureId,
    fixtureSha256,
    metrics: Object.freeze({
      create: metric(createMs),
      export: metric(exportRaw),
      import: metric([importMs]),
      migrate: metric([migrateMs]),
      restore: metric(restoreRaw),
      search: metric(searchRaw),
      startup: metric(startupRaw),
    }),
    profileId: input.profileId,
    records: input.records,
    seed: input.seed,
    startedAt,
  });
};

const jobId = (index: number): string =>
  `0198e106-0000-7000-8000-${String(index).padStart(12, "0")}`;

const insertSearchBatch = async (
  database: Awaited<ReturnType<typeof openBrowserSqliteDatabase>>,
  rows: readonly BenchmarkRow[],
): Promise<void> => {
  await database.transaction(async (transaction) => {
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
      await transaction.execute(
        sqlStatement(
          `INSERT INTO job(
             id, company_id, title, normalized_title, description_text, created_at, updated_at
           ) VALUES ${placeholders}`,
          batch.flatMap((row) => [
            jobId(row.id),
            null,
            row.title,
            row.normalizedTitle,
            "Synthetic benchmark description for lexical measurement.".padEnd(
              row.description.length,
              "x",
            ),
            "2026-08-25T18:00:00.000Z",
            "2026-08-25T18:00:00.000Z",
          ]),
        ),
      );
    }
  });
};

const measureJobSearch = async (
  database: Awaited<ReturnType<typeof openBrowserSqliteDatabase>>,
  disableFts5: boolean,
  records: number,
): Promise<{
  readonly initializeMs: number;
  readonly mode: "fts5" | "normalized-token";
  readonly searchRaw: readonly number[];
}> => {
  const [search, initializeMs] = await measured(() =>
    openJobSearchRepository(database, { disableFts5 }),
  );
  const searchRaw: number[] = [];
  for (let run = 0; run < SEARCH_WARMUPS + SEARCH_RUNS; run += 1) {
    const token = ((run * 37) % Math.min(records, 256)) + 1;
    const [response, searchMs] = await measured(() =>
      search.search({ query: `software ${String(token).padStart(3, "0")}` }),
    );
    if (
      response.results.length === 0 ||
      response.results.some((result) => !result.title.endsWith(String(token).padStart(3, "0")))
    ) {
      throw new Error("Job-search benchmark returned an incorrect result set.");
    }
    if (run >= SEARCH_WARMUPS) searchRaw.push(searchMs);
  }
  return Object.freeze({
    initializeMs,
    mode: search.capability.mode,
    searchRaw: Object.freeze(searchRaw),
  });
};

export const runJobSearchBenchmark = async (
  input: StorageBenchmarkInput,
  migrations: readonly SqlMigration[],
): Promise<JobSearchBenchmarkResult> => {
  const startedAt = new Date().toISOString();
  const rows = createRows(input);
  const fixtureSha256 = await sha256Text(
    rows
      .map((row) =>
        [row.id, row.title, row.normalizedTitle, row.description].map(String).join("\u001f"),
      )
      .join("\n"),
  );
  const databaseName = `/coredrill-job-search-benchmark-${input.profileId.toLowerCase()}.sqlite3`;
  let database = await openBrowserSqliteDatabase({ databaseName });
  await database.delete();
  database = await openBrowserSqliteDatabase({ databaseName });

  const [, migrateMs] = await measured(() =>
    applySqlMigrations(database, migrations, "2026-08-25T18:00:00.000Z"),
  );
  const [, importMs] = await measured(() => insertSearchBatch(database, rows));
  const accelerated = await measureJobSearch(database, false, input.records);
  if (accelerated.mode !== "fts5") {
    throw new Error("The selected browser SQLite build did not provide the reviewed FTS5 path.");
  }
  const fallback = await measureJobSearch(database, true, input.records);
  if (fallback.mode !== "normalized-token") {
    throw new Error("The reviewed normalized-token fallback was not selected.");
  }
  const portable = await database.exportPortable();
  await database.delete();

  return Object.freeze({
    byteLength: portable.byteLength,
    completedAt: new Date().toISOString(),
    fixtureId: input.fixtureId,
    fixtureSha256,
    metrics: Object.freeze({
      fallbackSearch: metric(fallback.searchRaw),
      ftsInitialize: metric([accelerated.initializeMs]),
      ftsSearch: metric(accelerated.searchRaw),
      import: metric([importMs]),
      migrate: metric([migrateMs]),
    }),
    profileId: input.profileId,
    records: input.records,
    searchModes: Object.freeze(["fts5", "normalized-token"] as const),
    seed: input.seed,
    startedAt,
  });
};
