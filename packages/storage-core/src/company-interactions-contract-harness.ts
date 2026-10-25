import {
  companyInteractionReferenceV1,
  createCompanyInteractionsQuery,
  createCompanyInteractionSummaryQuery,
  type ListCompanyInteractionsInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createCompanyInteractionsRepository } from "./company-interactions-repository.js";
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
export const createCompanyInteractionsContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyInteractions.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyInteractions.cases
          .readScopedHistory,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e142-0000-7000-8000-${String(n).padStart(12, "0")}`;
          const at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z");
          const literal = "\uFEFF<script>literal</script>\0尾😀",
            long = `\uFEFF${"a".repeat(1020)}😀\0尾${"x".repeat(17000)}\uFEFF`;
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
              new DatabaseContractViolation("Company history attempted a canonical write."),
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
          const repository = createCompanyInteractionsRepository(observed),
            list = createCompanyInteractionsQuery(repository),
            summary = createCompanyInteractionSummaryQuery(repository);
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
          const read = async (input: ListCompanyInteractionsInputV1 = request) => {
            const result = await list.execute(input, context);
            assertContract(result.ok, "Valid company history was rejected.");
            return result.value;
          };
          const fail = async (input: ListCompanyInteractionsInputV1, code: string) => {
            const result = await list.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "Company history silently rebound a viewed scope or reference.",
            );
          };
          await fail(request, "not_found");
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic history vault",
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
          assertContract((await read()).items.length === 0, "An empty company invented history.");
          await database.execute(
            sqlStatement(
              "INSERT INTO contact(id,company_id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)",
              [
                id(6),
                id(3),
                "PRIVATE contact name",
                "private@example.test",
                "PRIVATE contact notes",
                at,
                later,
              ],
            ),
          );
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
          const add = (
            n: number,
            job: number,
            body: string,
            occurred = at,
            contact: string | null = id(6),
          ) =>
            database.execute(
              sqlStatement(
                "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',?,?,?,?)",
                [
                  id(n),
                  id(job),
                  contact,
                  body,
                  occurred,
                  occurred > later ? occurred : later,
                  occurred > later ? occurred : later,
                ],
              ),
            );
          for (let n = 1000; n < 1026; n++)
            await add(n, 100, literal, at, n % 2 === 0 ? id(6) : null);
          await add(500, 100, long, future);
          await add(2000, 101, literal);
          await add(3000, 102, literal);
          const snapshot = async () =>
            JSON.stringify({
              interactions: await database.query(
                sqlStatement(
                  "SELECT id,job_id,contact_id,CAST(summary AS BLOB) AS summary,row_version FROM interaction ORDER BY id",
                ),
              ),
              jobs: await database.query(
                sqlStatement("SELECT id,company_id,archived_at,row_version FROM job ORDER BY id"),
              ),
              contacts: await database.query(
                sqlStatement(
                  "SELECT id,company_id,archived_at,row_version FROM contact ORDER BY id",
                ),
              ),
            });
          const before = await snapshot(),
            first = await read();
          assertContract(first.nextCursor !== null, "Company history lost continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(second.nextCursor !== null, "Company history lost middle continuation.");
          const third = await read({ ...request, after: second.nextCursor }),
            all = [...first.items, ...second.items, ...third.items];
          assertContract(
            JSON.stringify(all.map((item) => item.id)) ===
              JSON.stringify([id(500), ...Array.from({ length: 26 }, (_, n) => id(n + 1000))]),
            "Company history inferred contact employment, skipped equal keys or hid a future record.",
          );
          const selected = first.items[0];
          assertContract(selected !== undefined, "Company history lost its selected record.");
          assertContract(
            selected.summaryTruncated &&
              selected.summaryPreview === `\uFEFF${"a".repeat(1020)}` &&
              all[1]?.summaryPreview === literal &&
              all[1].currentJob.title === literal,
            "Literal history preview changed across an adapter.",
          );
          const reference = companyInteractionReferenceV1(first, selected);
          let offset = 0,
            reconstructed = "";
          do {
            const part = await summary.execute(
              {
                specVersion: 1,
                reference,
                summaryByteLength: selected.summaryByteLength,
                byteOffset: offset,
                limitBytes: 1024,
              },
              context,
            );
            assertContract(part.ok, "Valid bounded company summary was rejected.");
            reconstructed += part.value.text;
            offset = part.value.nextByteOffset ?? selected.summaryByteLength;
          } while (offset < selected.summaryByteLength);
          assertContract(
            reconstructed === long && !third.hasMore && third.nextCursor === null,
            "Company summary reconstruction or final-page semantics changed.",
          );
          await fail({ ...request, expectedVaultId: id(9) }, "not_found");
          await fail({ ...request, companyId: id(3), after: first.nextCursor }, "validation");
          assertContract(
            (await snapshot()) === before &&
              !JSON.stringify(all).includes("PRIVATE") &&
              statements.every(
                (statement) =>
                  !/\bemail\b|\bphone\b|\bnotes\b|description_text|count\(|SELECT \*/iu.test(
                    statement.sql,
                  ),
              ),
            "Company history read changed or overfetched private data.",
          );
          await database.execute(sqlStatement("DELETE FROM contact WHERE id=?", [id(6)]));
          const detached = await summary.execute(
            { specVersion: 1, reference, summaryByteLength: selected.summaryByteLength },
            context,
          );
          assertContract(
            !detached.ok && detached.error.code === "conflict",
            "Deleted-contact reference silently rebound.",
          );
          assertContract(
            (await read()).items[0]?.contactId === null,
            "Contact deletion lost retained job history.",
          );
          const old = await read();
          await database.execute(
            sqlStatement("UPDATE job SET row_version=2 WHERE id=?", [id(100)]),
          );
          await fail({ ...request, after: old.nextCursor }, "conflict");
          await database.execute(
            sqlStatement("UPDATE job SET company_id=?,row_version=3 WHERE id=?", [id(3), id(100)]),
          );
          assertContract(
            (await read()).items.length === 0,
            "Moved-job history stayed attributed to its former company.",
          );
          const archived = await read({ ...request, includeArchivedJobs: true });
          assertContract(
            archived.items.length === 1 && archived.items[0]?.id === id(3000),
            "Explicit archived-job scope lost history.",
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
            "Archived-company choice also enabled archived jobs.",
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
            "Independent archive scopes lost the retained record.",
          );
        },
      },
    ],
  );
