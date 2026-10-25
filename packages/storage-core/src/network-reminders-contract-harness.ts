import {
  createNetworkRemindersQuery,
  type ListNetworkRemindersInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createNetworkRemindersRepository } from "./network-reminders-repository.js";
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
export const createNetworkRemindersContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.networkReminders.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.networkReminders.cases
          .readPendingReminders,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e160-0000-7000-8000-${String(n).padStart(12, "0")}`,
            at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z"),
            literal = "\uFEFFLiteral <script>inert()</script>\0尾😀";
          const statements: SqlStatement[] = [],
            query = <Row extends QueryRow = QueryRow>(
              session: Pick<DatabasePort, "query">,
              statement: SqlStatement,
            ) => {
              statements.push(statement);
              assertContract(
                statement.sql.trimStart().startsWith("SELECT "),
                "Reminder read attempted a mutation.",
              );
              return session.query<Row>(statement);
            };
          const forbid = (): Promise<never> =>
              Promise.reject(new DatabaseContractViolation("Reminder read attempted a write.")),
            lease = database.withReadSnapshot?.bind(database);
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
          const operation = createNetworkRemindersQuery(createNetworkRemindersRepository(observed)),
            context = {
              operationId: entityId("application-operation", id(90)),
              initiatedAt: later,
            },
            request = { specVersion: 1 as const, expectedVaultId: id(1), limit: 10 };
          const read = async (input: ListNetworkRemindersInputV1 = request) => {
            const result = await operation.execute(input, context);
            assertContract(result.ok, "Valid original-vault pending reminders rejected.");
            return result.value;
          };
          const fail = async (input: ListNetworkRemindersInputV1, code: string) => {
            const result = await operation.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "Changed or malformed reminder owner was accepted.",
            );
          };
          const schemaVersion = (await database.diagnostics()).schemaVersion;
          await database.transaction(async (session) => {
            await session.execute(
              sqlStatement(
                "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
                [id(1), "Synthetic reminder vault", schemaVersion, at, later],
              ),
            );
            for (const n of [2, 3])
              await session.execute(
                sqlStatement(
                  "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,'PRIVATE company notes',?,?,?)",
                  [id(n), literal, n === 2 ? later : null, at, later],
                ),
              );
            for (const [n, company, archived] of [
              [100, 2, false],
              [101, null, false],
              [102, 2, true],
              [103, 3, false],
            ] as const)
              await session.execute(
                sqlStatement(
                  "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,'PRIVATE job body',?,?,?)",
                  [
                    id(n),
                    company === null ? null : id(company),
                    literal,
                    archived ? later : null,
                    at,
                    later,
                  ],
                ),
              );
            await session.execute(
              sqlStatement(
                "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,'Synthetic saved','saved',900,0,?,?)",
                [id(500), at, later],
              ),
            );
            for (const [n, job] of [
              [5000, 100],
              [5001, 103],
            ] as const)
              await session.execute(
                sqlStatement(
                  "INSERT INTO application(id,job_id,current_status_id,notes,created_at,updated_at) VALUES(?,?,?,'PRIVATE application notes',?,?)",
                  [id(n), id(job), id(500), at, later],
                ),
              );
            for (const [n, job] of [
              [200, 100],
              [201, 103],
            ] as const)
              await session.execute(
                sqlStatement(
                  "INSERT INTO next_action(id,job_id,title,due_at,timezone,created_at,updated_at) VALUES(?,?,?,?,'America/New_York',?,?)",
                  [id(n), id(job), literal, future, at, later],
                ),
              );
            for (const [n, application] of [
              [300, 5000],
              [301, 5001],
            ] as const)
              await session.execute(
                sqlStatement(
                  "INSERT INTO interview(id,application_id,stage_name,starts_at,timezone,duration_minutes,location_or_url,preparation_notes,outcome,created_at,updated_at) VALUES(?,?,?,?,'America/New_York',60,'PRIVATE location','PRIVATE preparation','PRIVATE outcome',?,?)",
                  [id(n), id(application), literal, future, at, later],
                ),
              );
            for (const n of [
              ...Array.from({ length: 27 }, (_, index) => 1000 + index),
              1100,
              1200,
              1300,
              1400,
              1401,
            ]) {
              const job = n === 1100 ? 101 : n === 1200 ? 102 : n === 1300 ? 103 : 100,
                detached = n === 1100 || n === 1200;
              await session.execute(
                sqlStatement(
                  "INSERT INTO reminder(id,job_id,next_action_id,interview_id,remind_at,timezone,state,note,fired_at,created_at,updated_at) VALUES(?,?,?,?,?,'America/New_York',?,'PRIVATE reminder note',?,?,?)",
                  [
                    id(n),
                    id(job),
                    detached ? null : id(n === 1300 ? 201 : 200),
                    detached ? null : id(n === 1300 ? 301 : 300),
                    future,
                    n === 1400 ? "fired" : n === 1401 ? "dismissed" : "pending",
                    n === 1400 ? later : null,
                    at,
                    later,
                  ],
                ),
              );
            }
          });
          // Test-only witness uses the underlying database, never the minimized runtime port.
          const witness = async () =>
            JSON.stringify(
              await Promise.all(
                ["company", "job", "application", "next_action", "interview", "reminder"].map(
                  (name) => database.query(sqlStatement(`SELECT * FROM ${name} ORDER BY id`)),
                ),
              ),
            );
          const before = await witness(),
            first = await read();
          assertContract(
            JSON.stringify(first.items.map((item) => item.id)) ===
              JSON.stringify(Array.from({ length: 10 }, (_, n) => id(1000 + n))) &&
              first.nextCursor !== null,
            "Pending reminder equal-time head differs.",
          );
          const head = first.items[0];
          assertContract(
            head?.currentJob.title === literal &&
              head.currentJob.company?.archivedAt === later &&
              head.nextAction?.title === literal &&
              head.nextAction.dueAt === future &&
              head.interview?.stageName === literal &&
              head.interview.startsAt === future &&
              head.remindAt === future,
            "Literal metadata or distinct alert/task/interview times were changed.",
          );
          assertContract(
            !JSON.stringify(first).includes("PRIVATE"),
            "Pending reminders disclosed a private body.",
          );
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(
            JSON.stringify(second.items.map((item) => item.id)) ===
              JSON.stringify(Array.from({ length: 10 }, (_, n) => id(1010 + n))) &&
              second.nextCursor !== null,
            "Pending reminder continuation differs.",
          );
          const third = await read({ ...request, after: second.nextCursor });
          assertContract(
            third.items.length === 9 && !third.hasMore && third.nextCursor === null,
            "Pending reminder archive/state filtering differs.",
          );
          const detached = third.items.find((item) => item.id === id(1100));
          assertContract(
            detached?.currentJob.company === null &&
              detached.nextAction === null &&
              detached.interview === null,
            "Standalone reminder invented a relationship.",
          );
          const archivedFirst = await read({ ...request, includeArchivedJobs: true, limit: 25 });
          const archivedTail = await read({
            ...request,
            includeArchivedJobs: true,
            limit: 25,
            after: archivedFirst.nextCursor,
          });
          assertContract(
            archivedTail.items.length === 5 &&
              archivedTail.items.find((item) => item.id === id(1200))?.currentJob.archivedAt ===
                later,
            "Explicit archived-job reminder scope differs.",
          );
          await fail({ ...request, expectedVaultId: id(9) }, "not_found");
          assertContract(
            (await witness()) === before,
            "Read-only reminders changed canonical data.",
          );
          assertContract(
            !statements.some((entry) =>
              /r\.note|preparation_notes|location_or_url|contact_ids_json|\.description_text|\.notes|i\.outcome|\bcontact\b/iu.test(
                entry.sql,
              ),
            ),
            "Reminder query preloaded a private body or contact data.",
          );
          await database.execute(
            sqlStatement("UPDATE reminder SET next_action_id=? WHERE id=?", [id(201), id(1001)]),
          );
          await fail({ ...request, limit: 1 }, "internal");
          await database.execute(
            sqlStatement("UPDATE reminder SET next_action_id=? WHERE id=?", [id(200), id(1001)]),
          );
          await database.execute(
            sqlStatement("UPDATE next_action SET title=?,row_version=row_version+1 WHERE id=?", [
              "Synthetic task changed",
              id(200),
            ]),
          );
          await fail({ ...request, after: first.nextCursor }, "conflict");
          const taskChanged = await read();
          assertContract(
            taskChanged.nextCursor !== null,
            "Updated task lost pending reminder page.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE application SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              [later, later, id(5000)],
            ),
          );
          await fail({ ...request, after: taskChanged.nextCursor }, "conflict");
          const applicationChanged = await read();
          assertContract(
            applicationChanged.nextCursor !== null &&
              applicationChanged.items[0]?.interview?.application.archivedAt === later,
            "Archived application context was hidden.",
          );
          await database.execute(sqlStatement("DELETE FROM company WHERE id=?", [id(2)]));
          await fail({ ...request, after: applicationChanged.nextCursor }, "conflict");
          const companyDetached = await read();
          assertContract(
            companyDetached.nextCursor !== null &&
              companyDetached.items[0]?.currentJob.company === null,
            "Company deletion erased reminder history.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE job SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              [later, later, id(100)],
            ),
          );
          await fail({ ...request, after: companyDetached.nextCursor }, "conflict");
          const active = await read();
          assertContract(
            active.items.every((item) => item.currentJob.archivedAt === null),
            "Archived job remained in default reminder scope.",
          );
          const included = await read({ ...request, includeArchivedJobs: true, limit: 1 }),
            includedHead = included.items[0];
          assertContract(
            included.nextCursor !== null && includedHead !== undefined,
            "Archived pending reminder anchor unavailable.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE reminder SET state='dismissed',row_version=row_version+1 WHERE id=?",
              [includedHead.id],
            ),
          );
          await fail(
            { ...request, includeArchivedJobs: true, limit: 1, after: included.nextCursor },
            "conflict",
          );
          await database.execute(sqlStatement("DELETE FROM interview WHERE id=?", [id(300)]));
          const surviving = await read({ ...request, includeArchivedJobs: true, limit: 25 });
          assertContract(
            surviving.items.some((item) => item.id === id(1100)) &&
              surviving.items.every((item) => item.interview?.id !== id(300)),
            "Interview cascade removed standalone reminders or retained broken links.",
          );
          await database.execute(sqlStatement("DELETE FROM reminder"));
          assertContract(
            (await read()).items.length === 0,
            "Confirmed pending reminder scope is not empty.",
          );
        },
      },
    ],
  );
