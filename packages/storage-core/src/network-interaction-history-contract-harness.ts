import {
  createNetworkInteractionsQuery,
  createNetworkInteractionSummaryQuery,
  networkInteractionReferenceV1,
  type ListNetworkInteractionsInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createNetworkInteractionHistoryRepository } from "./network-interaction-history-repository.js";
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
export const createNetworkInteractionHistoryContractSuite = (
  setup: Phase1RepositoryContractSetup,
) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.networkInteractions.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.networkInteractions.cases
          .readVaultHistory,
        run: async (database) => {
          await setup.migrate(database);
          const id = (n: number) => `0198e158-0000-7000-8000-${String(n).padStart(12, "0")}`,
            at = instant("2026-10-24T12:00:00.000Z"),
            later = instant("2026-10-25T12:00:00.000Z"),
            future = instant("2027-01-01T00:00:00.000Z");
          const title = "\uFEFFJob <script>inert()</script>\0尾😀",
            companyName = "\uFEFFCompany\0尾😀",
            literal = "\uFEFF" + "a".repeat(1020) + "😀\0尾" + "z".repeat(17000) + "\uFEFF";
          const statements: SqlStatement[] = [];
          const query = <Row extends QueryRow = QueryRow>(
            session: Pick<DatabasePort, "query">,
            statement: SqlStatement,
          ) => {
            statements.push(statement);
            return session.query<Row>(statement);
          };
          const forbid = (): Promise<never> =>
              Promise.reject(new DatabaseContractViolation("Network history attempted a write.")),
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
          const repository = createNetworkInteractionHistoryRepository(observed),
            operation = createNetworkInteractionsQuery(repository),
            summary = createNetworkInteractionSummaryQuery(repository),
            context = {
              operationId: entityId("application-operation", id(90)),
              initiatedAt: later,
            };
          const request = { specVersion: 1 as const, expectedVaultId: id(1), limit: 10 };
          const read = async (input: ListNetworkInteractionsInputV1 = request) => {
            const result = await operation.execute(input, context);
            assertContract(result.ok, "Valid vault-wide Network history rejected.");
            return result.value;
          };
          const fail = async (input: ListNetworkInteractionsInputV1, code: string) => {
            const result = await operation.execute(input, context);
            assertContract(
              !result.ok && result.error.code === code,
              "Network history silently rebound original scope/reference.",
            );
          };
          await fail(request, "not_found");
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic Network history vault",
                (await database.diagnostics()).schemaVersion,
                at,
                later,
              ],
            ),
          );
          for (const n of [2, 3])
            await database.execute(
              sqlStatement(
                "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                [
                  id(n),
                  n === 2 ? companyName : "Synthetic archived company",
                  "PRIVATE company notes",
                  n === 3 ? later : null,
                  at,
                  later,
                ],
              ),
            );
          for (const [n, company, archived] of [
            [100, 2, false],
            [101, null, false],
            [102, 2, true],
            [103, 3, false],
          ] as const)
            await database.execute(
              sqlStatement(
                "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                [
                  id(n),
                  company === null ? null : id(company),
                  title,
                  "PRIVATE job body",
                  archived ? later : null,
                  at,
                  later,
                ],
              ),
            );
          await database.execute(
            sqlStatement(
              "INSERT INTO contact(id,company_id,name,email,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              [
                id(30),
                id(3),
                "PRIVATE contact name",
                "private@example.test",
                "PRIVATE contact notes",
                at,
                later,
              ],
            ),
          );
          const add = (
            n: number,
            job = 100,
            contact: number | null = null,
            value = "Synthetic short summary",
            occurred = later,
          ) =>
            database.execute(
              sqlStatement(
                "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',?,?,?,?)",
                [
                  id(n),
                  id(job),
                  contact === null ? null : id(contact),
                  value,
                  occurred,
                  later,
                  later,
                ],
              ),
            );
          assertContract(
            (await read()).items.length === 0,
            "Unqueried history was not distinguished from confirmed empty.",
          );
          for (let n = 1000; n < 1026; n++)
            await add(
              n,
              n === 1001 ? 101 : 100,
              n % 2 === 0 ? 30 : null,
              n === 1000 ? literal : n === 1001 ? "" : "Synthetic short summary",
            );
          await add(500, 100, null, "Synthetic future import", future);
          await add(2000, 102);
          await add(3000, 103);
          const snapshot = async () =>
            JSON.stringify({
              events: await database.query(
                sqlStatement(
                  "SELECT id,job_id,contact_id,CAST(summary AS BLOB) AS body,row_version FROM interaction ORDER BY id",
                ),
              ),
              jobs: await database.query(
                sqlStatement("SELECT id,company_id,archived_at,row_version FROM job ORDER BY id"),
              ),
              companies: await database.query(
                sqlStatement(
                  "SELECT id,CAST(canonical_name AS BLOB) AS name,archived_at,row_version FROM company ORDER BY id",
                ),
              ),
            });
          const before = await snapshot(),
            first = await read();
          assertContract(first.nextCursor !== null, "Global history lost first continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(second.nextCursor !== null, "Global history lost middle continuation.");
          const third = await read({ ...request, after: second.nextCursor }),
            all = [...first.items, ...second.items, ...third.items];
          assertContract(
            JSON.stringify(all.map((e) => e.id)) ===
              JSON.stringify([
                id(500),
                ...Array.from({ length: 26 }, (_, n) => id(n + 1000)),
                id(3000),
              ]),
            "Vault-wide history dropped tied/future/job-only/other-company records or broadened job archive scope.",
          );
          const retained = all.find((e) => e.id === id(1000)),
            empty = all.find((e) => e.id === id(1001));
          assertContract(
            retained?.currentJob.title === title &&
              retained.currentJob.company?.name === companyName &&
              retained.contactId === id(30) &&
              retained.summaryTruncated,
            "Literal metadata, contact reference or bounded preview changed.",
          );
          assertContract(
            empty?.currentJob.company === null &&
              empty.contactId === null &&
              empty.summaryPreview === "" &&
              empty.summaryByteLength === 0 &&
              !empty.summaryTruncated &&
              all.at(-1)?.currentJob.company?.archivedAt === later,
            "Absent company/contact, empty summary or archived-company context was invented/filtered.",
          );
          const originalReference = networkInteractionReferenceV1(first, retained);
          let offset = 0,
            reconstructed = "",
            parts = 0;
          while (parts++ < 30) {
            const result = await summary.execute(
              {
                specVersion: 1,
                reference: originalReference,
                summaryByteLength: retained.summaryByteLength,
                byteOffset: offset,
                limitBytes: 1024,
              },
              context,
            );
            assertContract(result.ok, "Valid literal Network summary part rejected.");
            reconstructed += result.value.text;
            if (!result.value.hasMore) break;
            assertContract(
              result.value.nextByteOffset !== null && result.value.nextByteOffset > offset,
              "Summary failed to advance on a scalar boundary.",
            );
            offset = result.value.nextByteOffset;
          }
          assertContract(
            reconstructed === literal && parts < 30,
            "Full literal Network summary changed or stalled.",
          );
          const emptySummary = await summary.execute(
            {
              specVersion: 1,
              reference: networkInteractionReferenceV1(first, empty),
              summaryByteLength: 0,
            },
            context,
          );
          assertContract(
            emptySummary.ok && emptySummary.value.text === "" && !emptySummary.value.hasMore,
            "Empty retained summary became unavailable.",
          );
          await fail({ ...request, expectedVaultId: id(9) }, "not_found");
          await fail(
            { ...request, after: { ...first.nextCursor, includeArchivedJobs: true } },
            "validation",
          );
          assertContract(
            (await snapshot()) === before &&
              !JSON.stringify(all).includes("PRIVATE") &&
              !JSON.stringify(all).includes("private@example") &&
              statements.every(
                (s) =>
                  !/description_text|\bnotes\b|JOIN contact|\bemail\b|\bphone\b|count\(|SELECT \*/iu.test(
                    s.sql,
                  ),
              ),
            "Network read rewrote or preloaded unrelated private data.",
          );
          await database.execute(sqlStatement("DELETE FROM contact WHERE id=?", [id(30)]));
          await fail({ ...request, after: first.nextCursor }, "conflict");
          const staleSummary = await summary.execute(
            {
              specVersion: 1,
              reference: originalReference,
              summaryByteLength: retained.summaryByteLength,
            },
            context,
          );
          assertContract(
            !staleSummary.ok && staleSummary.error.code === "conflict",
            "Detached contact silently rebound a summary reference.",
          );
          const detached = await read();
          assertContract(
            detached.nextCursor !== null &&
              detached.items.find((e) => e.id === retained.id)?.contactId === null,
            "Deleted contact erased or relabeled recorded history.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE company SET canonical_name=?,row_version=row_version+1 WHERE id=?",
              ["Synthetic renamed current company", id(2)],
            ),
          );
          await fail({ ...request, after: detached.nextCursor }, "conflict");
          const renamed = await read();
          assertContract(
            renamed.nextCursor !== null &&
              renamed.items[0]?.currentJob.company?.name === "Synthetic renamed current company",
            "Current company rename was hidden or treated as event-time evidence.",
          );
          await database.execute(sqlStatement("DELETE FROM company WHERE id=?", [id(2)]));
          await fail({ ...request, after: renamed.nextCursor }, "conflict");
          const unlinked = await read();
          assertContract(
            unlinked.nextCursor !== null && unlinked.items[0]?.currentJob.company === null,
            "Company detachment dropped job-only history.",
          );
          await database.execute(
            sqlStatement("UPDATE job SET archived_at=?,row_version=row_version+1 WHERE id=?", [
              later,
              id(100),
            ]),
          );
          await fail({ ...request, after: unlinked.nextCursor }, "conflict");
          const active = await read();
          assertContract(
            active.items.length === 2 &&
              active.items.some((e) => e.currentJob.company?.archivedAt === later),
            "Archive policy filtered archived companies or retained archived jobs implicitly.",
          );
          const included = await read({ ...request, includeArchivedJobs: true, limit: 25 });
          assertContract(included.nextCursor !== null, "Explicit archived jobs lost continuation.");
          const includedLast = await read({
            ...request,
            includeArchivedJobs: true,
            limit: 25,
            after: included.nextCursor,
          });
          assertContract(
            includedLast.items.some((e) => e.id === id(2000)) && !includedLast.hasMore,
            "Explicit archived scope lost stored interactions.",
          );
        },
      },
    ],
  );
