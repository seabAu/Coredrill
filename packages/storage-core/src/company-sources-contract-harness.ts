import { createCompanySourcesQuery, type ListCompanySourcesInputV1 } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createCompanySourcesRepository } from "./company-sources-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseReadSnapshot,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
export const createCompanySourcesContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companySources.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companySources.cases
          .readScopedSources,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e152-0000-7000-8000-${String(n).padStart(12, "0")}`;
          const at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z");
          const literal = "\uFEFF<source>\0尾😀",
            literalUrl = "https://EXAMPLE.test:443/%7eRole?q=%2f";
          const statements: SqlStatement[] = [];
          const query = <Row extends QueryRow = QueryRow>(
            session: Pick<DatabasePort, "query">,
            statement: SqlStatement,
          ) => {
            statements.push(statement);
            return session.query<Row>(statement);
          };
          const forbid = (): Promise<never> =>
            Promise.reject(
              new DatabaseContractViolation("Company source query attempted a write."),
            );
          const lease = database.withReadSnapshot?.bind(database);
          const observed: DatabasePort = {
            query: (statement) => query(database, statement),
            execute: forbid,
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({ query: (statement) => query(session, statement), execute: forbid }),
              ),
            ...(lease === undefined
              ? {}
              : {
                  withReadSnapshot: <T>(work: (snapshot: DatabaseReadSnapshot) => Promise<T>) =>
                    lease((snapshot) =>
                      work({
                        query: (statement) => query(snapshot, statement),
                        exportPortable: snapshot.exportPortable.bind(snapshot),
                      }),
                    ),
                }),
          };
          const operation = createCompanySourcesQuery(createCompanySourcesRepository(observed));
          const context = {
            operationId: entityId("application-operation", id(90)),
            initiatedAt: later,
          };
          const request = {
            specVersion: 1 as const,
            expectedVaultId: id(1),
            companyId: id(2),
            expectedCompanyRowVersion: 1,
            limit: 10,
          };
          const read = async (input: ListCompanySourcesInputV1 = request) => {
            const result = await operation.execute(input, context);
            assertContract(result.ok, "A valid company listing-source page was rejected.");
            return result.value;
          };
          const fail = async (input: ListCompanySourcesInputV1, code: string) => {
            const result = await operation.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "Company sources silently rebound an owner or canonical anchor.",
            );
          };
          await fail(request, "not_found");
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic source vault",
                (await database.diagnostics()).schemaVersion,
                at,
                later,
              ],
            ),
          );
          for (const n of [2, 3])
            await database.execute(
              sqlStatement(
                "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
                [id(n), `Synthetic company ${String(n)}`, "PRIVATE company notes", at, later],
              ),
            );
          assertContract((await read()).items.length === 0, "An empty company invented sources.");
          for (const n of [100, 101, 102])
            await database.execute(
              sqlStatement(
                "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                [
                  id(n),
                  n === 101 ? id(3) : id(2),
                  literal,
                  "PRIVATE job body",
                  n === 102 ? later : null,
                  at,
                  later,
                ],
              ),
            );
          for (const n of [
            500,
            ...Array.from({ length: 26 }, (_, index) => index + 1000),
            2000,
            3000,
          ])
            await database.execute(
              sqlStatement(
                "INSERT INTO job_source(id,job_id,external_id,canonical_url,first_seen_at,last_seen_at,content_hash,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                [
                  id(n),
                  n === 2000 ? id(101) : n === 3000 ? id(102) : id(100),
                  n === 1000 ? literal : null,
                  n === 1000 ? literalUrl : null,
                  at,
                  at,
                  n === 1000 ? "a".repeat(64) : null,
                  n === 1000 ? 1 : 0,
                  at,
                  n === 500 ? future : later,
                ],
              ),
            );
          const addSnapshot = (n: number, captured: string, hash: string) =>
            database.execute(
              sqlStatement(
                "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,raw_text,content_hash,retention_class,created_at) VALUES(?,?,?,'synthetic.extractor','1.0.0',?,?,'synthetic',?)",
                [
                  id(n),
                  id(1000),
                  captured,
                  `PRIVATE snapshot ${"x".repeat(10000)}`,
                  hash.repeat(64),
                  future,
                ],
              ),
            );
          await addSnapshot(5000, at, "a");
          await addSnapshot(5001, later, "b");
          await addSnapshot(5002, later, "c");
          const snapshot = async () =>
            JSON.stringify({
              sources: await database.query(
                sqlStatement(
                  "SELECT id,job_id,CAST(external_id AS BLOB) AS external_id,CAST(canonical_url AS BLOB) AS canonical_url,updated_at,row_version FROM job_source ORDER BY id",
                ),
              ),
              captures: await database.query(
                sqlStatement(
                  "SELECT id,job_source_id,captured_at,content_hash FROM source_snapshot ORDER BY id",
                ),
              ),
              jobs: await database.query(
                sqlStatement("SELECT id,company_id,archived_at,row_version FROM job ORDER BY id"),
              ),
            });
          const before = await snapshot(),
            first = await read();
          assertContract(first.nextCursor !== null, "Sources lost continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(second.nextCursor !== null, "Sources lost middle continuation.");
          const third = await read({ ...request, after: second.nextCursor }),
            all = [...first.items, ...second.items, ...third.items];
          assertContract(
            JSON.stringify(all.map((source) => source.id)) ===
              JSON.stringify([id(500), ...Array.from({ length: 26 }, (_, n) => id(n + 1000))]),
            "Source pages skipped equal keys, source-only rows, future imports or filtered membership.",
          );
          const captured = all.find((source) => source.id === id(1000));
          assertContract(
            captured?.externalId === literal &&
              captured.currentJob.title === literal &&
              captured.canonicalUrl?.text === literalUrl &&
              captured.canonicalUrl.href === "https://example.test/%7eRole?q=%2f" &&
              captured.latestSnapshot?.id === id(5001) &&
              captured.contentHash !== captured.latestSnapshot.contentHash,
            "Literal URL/current metadata or captured-time snapshot selection changed.",
          );
          assertContract(
            all[0]?.latestSnapshot === null && !third.hasMore && third.nextCursor === null,
            "Source-only or final-page semantics changed.",
          );
          await fail({ ...request, expectedVaultId: id(9) }, "not_found");
          await fail({ ...request, companyId: id(3), after: first.nextCursor }, "validation");
          assertContract(
            (await snapshot()) === before &&
              !JSON.stringify(all).includes("PRIVATE") &&
              statements.every(
                (statement) =>
                  !/raw_text|sanitized_html|structured_json|description_text|\bnotes\b|\bemail\b|count\(|SELECT \*/iu.test(
                    statement.sql,
                  ),
              ),
            "Source read rewrote or preloaded private data.",
          );
          await addSnapshot(5003, future, "d");
          assertContract(
            (await read()).items.find((source) => source.id === id(1000))?.latestSnapshot?.id ===
              id(5003),
            "New retained capture did not remain live source metadata.",
          );
          await read({ ...request, after: first.nextCursor });
          await database.execute(
            sqlStatement(
              "UPDATE job_source SET external_id=?,row_version=row_version+1 WHERE id=?",
              ["Intentionally edited synthetic source", first.nextCursor.sourceId],
            ),
          );
          await fail({ ...request, after: first.nextCursor }, "conflict");
          const current = await read();
          assertContract(current.nextCursor !== null, "Edited source lost fresh continuation.");
          await database.execute(
            sqlStatement("UPDATE job SET company_id=?,row_version=2 WHERE id=?", [id(3), id(100)]),
          );
          await fail({ ...request, after: current.nextCursor }, "conflict");
          assertContract(
            (await read()).items.length === 0,
            "Moved job sources remained attributed to the old company.",
          );
          assertContract(
            (await read({ ...request, includeArchivedJobs: true })).items[0]?.id === id(3000),
            "Archived-job scope lost its source.",
          );
          await database.execute(
            sqlStatement("UPDATE company SET archived_at=?,row_version=2 WHERE id=?", [
              later,
              id(2),
            ]),
          );
          await fail(request, "conflict");
          await fail(
            { ...request, expectedCompanyRowVersion: 2, includeArchivedJobs: true },
            "not_found",
          );
          assertContract(
            (await read({ ...request, expectedCompanyRowVersion: 2, includeArchivedCompany: true }))
              .items.length === 0,
            "Archived-company scope enabled archived jobs implicitly.",
          );
          assertContract(
            (
              await read({
                ...request,
                expectedCompanyRowVersion: 2,
                includeArchivedCompany: true,
                includeArchivedJobs: true,
              })
            ).items.length === 1,
            "Independent source archive scope lost a stored record.",
          );
        },
      },
    ],
  );
