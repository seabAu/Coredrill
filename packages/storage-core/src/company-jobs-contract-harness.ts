import { createCompanyJobsQuery, type ListCompanyJobsInputV1 } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createCompanyJobsRepository } from "./company-jobs-repository.js";
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
export const createCompanyJobsContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyJobs.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyJobs.cases.readScopedJobs,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e132-0000-7000-8000-${String(n).padStart(12, "0")}`;
          const at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z");
          const literal = "\uFEFFSynthetic <script>inert</script>\0尾😀",
            privateText = "PRIVATE synthetic relationship body";
          const statements: SqlStatement[] = [];
          const query = <Row extends QueryRow = QueryRow>(
            session: Pick<DatabasePort, "query">,
            statement: SqlStatement,
          ) => {
            statements.push(statement);
            return session.query<Row>(statement);
          };
          const forbidWrite = (): Promise<never> =>
            Promise.reject(
              new DatabaseContractViolation("A company relationship read attempted a write."),
            );
          const withSnapshot = database.withReadSnapshot?.bind(database);
          const observed: DatabasePort = {
            query: (statement) => query(database, statement),
            execute: forbidWrite,
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({ query: (statement) => query(session, statement), execute: forbidWrite }),
              ),
            ...(withSnapshot === undefined
              ? {}
              : {
                  withReadSnapshot: <T>(work: (snapshot: DatabaseReadSnapshot) => Promise<T>) =>
                    withSnapshot((snapshot) =>
                      work({
                        query: (statement) => query(snapshot, statement),
                        exportPortable: snapshot.exportPortable.bind(snapshot),
                      }),
                    ),
                }),
          };
          const operations = createCompanyJobsQuery(createCompanyJobsRepository(observed));
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
          const read = async (input: ListCompanyJobsInputV1 = request) => {
            const result = await operations.execute(input, context);
            assertContract(result.ok, "A valid company-linked role page was rejected.");
            return result.value;
          };
          const fail = async (input: ListCompanyJobsInputV1, code: string) => {
            const result = await operations.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "A company relationship owner or continuation was silently rebound.",
            );
          };
          const snapshot = async () =>
            JSON.stringify({
              companies: await database.query(sqlStatement("SELECT * FROM company ORDER BY id")),
              jobs: await database.query(
                sqlStatement(
                  "SELECT id,company_id,CAST(title AS BLOB) AS title,description_text,archived_at,row_version,updated_at FROM job ORDER BY id",
                ),
              ),
            });
          await fail(request, "not_found");
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic relationship vault",
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
                [id(n), `Synthetic company ${String(n)}`, privateText, at, later],
              ),
            );
          assertContract(
            (await read()).items.length === 0,
            "An empty company invented linked roles.",
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,'saved',1,0,?,?)",
              [id(4), "\uFEFF Literal saved ", at, at],
            ),
          );
          for (const n of [10, ...Array.from({ length: 27 }, (_, index) => 100 + index), 200])
            await database.execute(
              sqlStatement(
                "INSERT INTO job(id,company_id,title,description_text,current_status_id,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                [
                  id(n),
                  n === 200 ? id(3) : id(2),
                  n === 100 ? literal : `Synthetic role ${String(n)}`,
                  privateText,
                  id(4),
                  n === 126 ? later : null,
                  at,
                  n === 10 ? future : later,
                ],
              ),
            );
          const before = await snapshot(),
            first = await read();
          assertContract(first.nextCursor !== null, "Company-linked jobs lost their continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(
            second.nextCursor !== null,
            "Company-linked jobs lost a middle continuation.",
          );
          const third = await read({ ...request, after: second.nextCursor });
          const all = [...first.items, ...second.items, ...third.items];
          assertContract(
            JSON.stringify(all.map((item) => item.id)) ===
              JSON.stringify([id(10), ...Array.from({ length: 26 }, (_, n) => id(n + 100))]),
            "Company-linked live pages skipped, duplicated or hid valid future roles.",
          );
          assertContract(
            all.find((item) => item.id === id(100))?.title === literal &&
              all[0]?.status?.name === "\uFEFF Literal saved ",
            "A stored role/status literal changed across an adapter.",
          );
          assertContract(
            !third.hasMore &&
              third.nextCursor === null &&
              !JSON.stringify(all).includes(privateText),
            "Linked roles exposed bodies or false continuation.",
          );
          await fail({ ...request, expectedVaultId: id(8) }, "not_found");
          await fail({ ...request, companyId: id(3), after: first.nextCursor }, "validation");
          await fail(
            { ...request, includeArchivedJobs: true, after: first.nextCursor },
            "validation",
          );
          assertContract(
            (await snapshot()) === before &&
              statements.every(
                (statement) =>
                  !/description_text|\bnotes\b|count\(|SELECT \*/iu.test(statement.sql),
              ),
            "Read-only relationship projections changed or preloaded private data.",
          );
          for (const mutation of ["edit", "move", "archive", "delete"] as const) {
            const current = await read();
            assertContract(
              current.nextCursor !== null,
              "A refreshed relationship page lost its anchor.",
            );
            const anchor = current.nextCursor.jobId;
            if (mutation === "delete")
              await database.execute(sqlStatement("DELETE FROM job WHERE id=?", [anchor]));
            else if (mutation === "move")
              await database.execute(
                sqlStatement("UPDATE job SET company_id=?,row_version=row_version+1 WHERE id=?", [
                  id(3),
                  anchor,
                ]),
              );
            else if (mutation === "archive")
              await database.execute(
                sqlStatement("UPDATE job SET archived_at=?,row_version=row_version+1 WHERE id=?", [
                  later,
                  anchor,
                ]),
              );
            else
              await database.execute(
                sqlStatement(
                  "UPDATE job SET description_text=?,row_version=row_version+1 WHERE id=?",
                  ["Intentionally edited synthetic body", anchor],
                ),
              );
            const changed = await snapshot();
            await fail({ ...request, after: current.nextCursor }, "conflict");
            assertContract(
              (await snapshot()) === changed,
              "A stale continuation rejection changed canonical data.",
            );
          }
          await database.execute(
            sqlStatement("UPDATE company SET notes=?,row_version=2 WHERE id=?", [
              "Intentionally edited synthetic note",
              id(2),
            ]),
          );
          await fail(request, "conflict");
          await read({ ...request, expectedCompanyRowVersion: 2 });
          await database.execute(
            sqlStatement("UPDATE company SET archived_at=?,row_version=3 WHERE id=?", [
              later,
              id(2),
            ]),
          );
          await fail(
            { ...request, expectedCompanyRowVersion: 3, includeArchivedJobs: true },
            "not_found",
          );
          const active = await read({
            ...request,
            expectedCompanyRowVersion: 3,
            includeArchivedCompany: true,
            limit: 25,
          });
          assertContract(
            active.items.every((item) => item.archivedAt === null),
            "Archived company scope also enabled archived roles.",
          );
          const archived = await read({
            ...request,
            expectedCompanyRowVersion: 3,
            includeArchivedCompany: true,
            includeArchivedJobs: true,
            limit: 25,
          });
          const remainder =
            archived.nextCursor === null
              ? []
              : (
                  await read({
                    ...request,
                    expectedCompanyRowVersion: 3,
                    includeArchivedCompany: true,
                    includeArchivedJobs: true,
                    limit: 25,
                    after: archived.nextCursor,
                  })
                ).items;
          assertContract(
            [...archived.items, ...remainder].some(
              (item) => item.id === id(126) && item.archivedAt === later,
            ),
            "Explicit archived-role scope lost a stored linked role.",
          );
        },
      },
    ],
  );
