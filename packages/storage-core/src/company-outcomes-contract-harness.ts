import {
  createCompanyOutcomesQueryV1,
  type ListCompanyOutcomesInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createCompanyOutcomesRepository } from "./company-outcomes-repository.js";
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
export const createCompanyOutcomesContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyOutcomes.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyOutcomes.cases
          .readRecordedHistory,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e154-0000-7000-8000-${String(n).padStart(12, "0")}`;
          const at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z"),
            literal = "\uFEFFJob <script>inert()</script>\0尾😀";
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
              new DatabaseContractViolation("Company outcome query attempted a write."),
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
          const operation = createCompanyOutcomesQueryV1(createCompanyOutcomesRepository(observed)),
            context = {
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
          const read = async (input: ListCompanyOutcomesInputV1 = request) => {
            const result = await operation.execute(input, context);
            assertContract(result.ok, "Valid recorded company history rejected.");
            return result.value;
          };
          const fail = async (input: ListCompanyOutcomesInputV1, code: string) => {
            const result = await operation.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "Company outcome owner/anchor silently rebound.",
            );
          };
          await fail(request, "not_found");
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic outcome vault",
                (await database.diagnostics()).schemaVersion,
                at,
                later,
              ],
            ),
          );
          for (const n of [2, 3, 4])
            await database.execute(
              sqlStatement(
                "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
                [id(n), `Synthetic company ${String(n)}`, "PRIVATE company notes", at, later],
              ),
            );
          for (const [n, company, archived] of [
            [100, 2, false],
            [101, 3, false],
            [102, 2, true],
          ] as const)
            await database.execute(
              sqlStatement(
                "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                [
                  id(n),
                  id(company),
                  literal,
                  "PRIVATE job body",
                  archived ? later : null,
                  at,
                  later,
                ],
              ),
            );
          for (const [n, name, category, terminal] of [
            [40, "Synthetic active <script> 😀", "saved", 0],
            [41, "Synthetic rejection", "rejected", 1],
            [42, "Synthetic reopened", "preparing", 0],
          ] as const)
            await database.execute(
              sqlStatement(
                "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                [id(n), name, category, n, terminal, at, later],
              ),
            );
          await database.execute(
            sqlStatement(
              "INSERT INTO application(id,job_id,current_status_id,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              [id(300), id(100), id(41), "PRIVATE application notes", later, at, later],
            ),
          );
          const addEvent = (
            n: number,
            job = 100,
            application: number | null = null,
            from: number | null = 40,
            to = 41,
            occurred = later,
          ) =>
            database.execute(
              sqlStatement(
                "INSERT INTO status_event(id,job_id,application_id,from_status_id,to_status_id,occurred_at,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
                [
                  id(n),
                  id(job),
                  application === null ? null : id(application),
                  from === null ? null : id(from),
                  id(to),
                  occurred,
                  "PRIVATE event notes",
                  later,
                ],
              ),
            );
          for (let n = 1000; n < 1026; n++)
            await addEvent(n, 100, n === 1000 ? 300 : null, n === 1001 ? null : 40);
          await addEvent(500, 100, null, 41, 42, future);
          await addEvent(2000, 101);
          await addEvent(3000, 102);
          await database.execute(
            sqlStatement(
              "INSERT INTO mutation_undo_token(id,kind,job_id,status_event_id,previous_status_id,expected_status_id,expected_job_row_version,created_at) VALUES(?,'status_change',?,?,?,?,?,?)",
              [id(5000), id(100), id(1008), id(40), id(41), 1, later],
            ),
          );
          const snapshot = async () =>
            JSON.stringify({
              events: await database.query(
                sqlStatement(
                  "SELECT id,job_id,application_id,from_status_id,to_status_id,occurred_at,CAST(note AS BLOB) AS note FROM status_event ORDER BY id",
                ),
              ),
              jobs: await database.query(
                sqlStatement(
                  "SELECT id,company_id,row_version,CAST(description_text AS BLOB) AS body FROM job ORDER BY id",
                ),
              ),
              applications: await database.query(
                sqlStatement(
                  "SELECT id,job_id,row_version,CAST(notes AS BLOB) AS notes FROM application ORDER BY id",
                ),
              ),
            });
          const before = await snapshot(),
            first = await read();
          assertContract(first.nextCursor !== null, "History lost its first continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(second.nextCursor !== null, "History lost its middle continuation.");
          const third = await read({ ...request, after: second.nextCursor }),
            all = [...first.items, ...second.items, ...third.items];
          assertContract(
            JSON.stringify(all.map((e) => e.id)) ===
              JSON.stringify([id(500), ...Array.from({ length: 26 }, (_, n) => id(1000 + n))]),
            "History skipped equal keys, nullable application rows, future events or current membership.",
          );
          assertContract(
            all[0]?.fromStatus?.terminal === true &&
              !all[0].toStatus.terminal &&
              all[1]?.application?.archivedAt === later &&
              all[2]?.application === null &&
              all[2].fromStatus === null &&
              all[1].currentJob.title === literal,
            "Reopening, archive or literal metadata was inferred/replaced.",
          );
          assertContract(
            !third.hasMore &&
              third.nextCursor === null &&
              first.items.at(-1)?.undo?.consumedAt === null,
            "Final-page or undo metadata changed.",
          );
          await fail({ ...request, expectedVaultId: id(9) }, "not_found");
          await fail({ ...request, companyId: id(3), after: first.nextCursor }, "validation");
          assertContract(
            (await read({ ...request, companyId: id(4) })).items.length === 0,
            "Empty history was manufactured from another scope.",
          );
          assertContract(
            (await snapshot()) === before &&
              !JSON.stringify(all).includes("PRIVATE") &&
              statements.every(
                (s) =>
                  !/\be\.note\b|\bnotes\b|description_text|raw_text|\bemail\b|count\(|SELECT \*/iu.test(
                    s.sql,
                  ),
              ),
            "History read rewrote or preloaded private content.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE mutation_undo_token SET consumed_at=?,row_version=row_version+1 WHERE id=?",
              [later, id(5000)],
            ),
          );
          await fail({ ...request, after: first.nextCursor }, "conflict");
          const reversed = await read();
          assertContract(
            reversed.items.at(-1)?.undo?.consumedAt === later,
            "Recorded reversal was lost.",
          );
          const applicationPage = await read({ ...request, limit: 2 });
          assertContract(applicationPage.nextCursor !== null, "Application history lost cursor.");
          await database.execute(
            sqlStatement("UPDATE application SET row_version=row_version+1 WHERE id=?", [id(300)]),
          );
          await fail({ ...request, limit: 2, after: applicationPage.nextCursor }, "conflict");
          await database.execute(
            sqlStatement(
              "UPDATE status_definition SET name=?,category='withdrawn',row_version=row_version+1 WHERE id=?",
              ["Synthetic current renamed stage", id(41)],
            ),
          );
          await fail({ ...request, after: reversed.nextCursor }, "conflict");
          const renamed = await read();
          assertContract(
            renamed.items[1]?.toStatus.name === "Synthetic current renamed stage" &&
              renamed.items[1].toStatus.category === "withdrawn",
            "Current stage metadata was disguised as immutable event facts.",
          );
          await database.execute(
            sqlStatement("UPDATE job SET company_id=?,row_version=row_version+1 WHERE id=?", [
              id(3),
              id(100),
            ]),
          );
          await fail({ ...request, after: renamed.nextCursor }, "conflict");
          assertContract(
            (await read()).items.length === 0 &&
              (await read({ ...request, includeArchivedJobs: true })).items[0]?.id === id(3000),
            "Current membership or independent archived-job scope failed.",
          );
          await database.execute(
            sqlStatement("UPDATE company SET archived_at=?,row_version=2 WHERE id=?", [
              later,
              id(2),
            ]),
          );
          await fail(request, "conflict");
          await fail({ ...request, expectedCompanyRowVersion: 2 }, "not_found");
          assertContract(
            (await read({ ...request, expectedCompanyRowVersion: 2, includeArchivedCompany: true }))
              .items.length === 0 &&
              (
                await read({
                  ...request,
                  expectedCompanyRowVersion: 2,
                  includeArchivedCompany: true,
                  includeArchivedJobs: true,
                })
              ).items.length === 1,
            "Archived company implicitly broadened linked-job scope.",
          );
        },
      },
    ],
  );
