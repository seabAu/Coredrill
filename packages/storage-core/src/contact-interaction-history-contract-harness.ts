import {
  createContactInteractionHistoryQuery,
  createContactInteractionSummaryQuery,
  type ContactInteractionCursorV1,
  type ContactInteractionPageV1,
  type ListContactInteractionsInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createContactInteractionHistoryRepository } from "./contact-interaction-history-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const id = <Entity extends string>(type: Entity, suffix: number) =>
  entityId(type, `0198e107-0000-7000-8000-${String(suffix).padStart(12, "0")}`);
const vaultId = id("vault", 1);
const contactId = id("contact", 2);
const jobId = id("job", 3);
const at = instant("2026-10-22T04:00:00.000Z");
const later = instant("2026-10-22T05:00:00.000Z");
const future = instant("2027-01-01T00:00:00.000Z");
const context = { operationId: id("application-operation", 4), initiatedAt: at };
const request = { specVersion: 1 as const, expectedVaultId: vaultId, contactId, limit: 2 };
const literal = "\uFEFFabc😀\0\n<script>literal</script>尾";

const seed = async (database: DatabasePort) => {
  await database.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      [vaultId, "Synthetic contact history", (await database.diagnostics()).schemaVersion, at, at],
    ),
  );
  await database.execute(
    sqlStatement("INSERT INTO company(id,canonical_name,created_at,updated_at) VALUES(?,?,?,?)", [
      id("company", 5),
      "Synthetic shared company",
      at,
      at,
    ]),
  );
  for (const selected of [contactId, id("contact", 6)])
    await database.execute(
      sqlStatement(
        "INSERT INTO contact(id,company_id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        [
          selected,
          id("company", 5),
          "Synthetic identity",
          "private@example.invalid",
          "Synthetic private notes",
          1,
          at,
          at,
        ],
      ),
    );
  for (const selected of [jobId, id("job", 7), id("job", 8)])
    await database.execute(
      sqlStatement("INSERT INTO job(id,company_id,title,created_at,updated_at) VALUES(?,?,?,?,?)", [
        selected,
        id("company", 5),
        "Synthetic current <role>",
        at,
        at,
      ]),
    );
};
const insert = (
  database: DatabasePort,
  suffix: number,
  body = literal,
  selectedContact: string | null = contactId,
  selectedJob: string = jobId,
  occurredAt = at,
) =>
  database.execute(
    sqlStatement(
      "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        id("interaction", suffix),
        selectedJob,
        selectedContact,
        "meeting",
        occurredAt,
        "mutual",
        body,
        occurredAt,
        occurredAt,
      ],
    ),
  );
const snapshot = async (database: DatabasePort) =>
  JSON.stringify(
    await Promise.all(
      [
        "vault",
        "company",
        "contact",
        "job",
        "interaction",
        "contact_manual_creation",
        "contact_point_provenance",
      ].map((table) => database.query(sqlStatement(`SELECT * FROM ${table} ORDER BY 1`))),
    ),
  );
const observeReads = (database: DatabasePort) => {
  const statements: SqlStatement[] = [];
  const forbid = (): Promise<never> =>
    Promise.reject(new DatabaseContractViolation("History read attempted a write."));
  const observed: DatabasePort = {
    query: database.query.bind(database),
    execute: forbid,
    exportPortable: database.exportPortable.bind(database),
    diagnostics: database.diagnostics.bind(database),
    transaction: (work) =>
      database.transaction((session) =>
        work({
          execute: forbid,
          query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
            statements.push(statement);
            return session.query<Row>(statement);
          },
        }),
      ),
  };
  const port = createContactInteractionHistoryRepository(observed);
  const pageQuery = createContactInteractionHistoryQuery(port);
  const summaryQuery = createContactInteractionSummaryQuery(port);
  const read = async (input: ListContactInteractionsInputV1 = request) => {
    const result = await pageQuery.execute(input, context);
    assert(result.ok, "Valid contact history was rejected.");
    return result.value;
  };
  return { statements, port, pageQuery, summaryQuery, read };
};
const referenceFor = (page: ContactInteractionPageV1): ContactInteractionCursorV1 => {
  const item = page.items[0];
  assert(item !== undefined, "Missing synthetic interaction reference.");
  return {
    specVersion: 1,
    vaultId: page.vaultId,
    contactId: page.contactId,
    includeArchived: page.includeArchived,
    contactRowVersion: page.contactRowVersion,
    occurredAt: item.occurredAt,
    id: item.id,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
  };
};

export const createContactInteractionHistoryContractSuite = (
  setup: Phase1RepositoryContractSetup,
) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactHistory.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactHistory.cases.readScopedPages,
        run: async (database) => {
          await setup.migrate(database);
          const { read, pageQuery, statements } = observeReads(database);
          const missing = await pageQuery.execute(request, context);
          assert(
            !missing.ok && missing.error.code === "not_found",
            "Missing vault became empty history.",
          );
          await seed(database);
          assert((await read()).items.length === 0, "Empty contact invented history.");
          for (const suffix of [12, 10, 11]) await insert(database, suffix);
          await insert(database, 13, literal, id("contact", 6));
          await insert(database, 14, literal, null);
          await insert(database, 15, "Future imported note", contactId, id("job", 7), future);
          await insert(database, 16, "Archived job note", contactId, id("job", 8));
          await database.execute(
            sqlStatement(
              "UPDATE job SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              [later, later, id("job", 8)],
            ),
          );
          const before = await snapshot(database);
          statements.length = 0;
          const first = await read();
          assert(first.nextCursor !== null && first.hasMore, "Missing exact continuation.");
          const second = await read({ ...request, after: first.nextCursor });
          assert(
            JSON.stringify([...first.items, ...second.items].map((item) => item.id)) ===
              JSON.stringify([15, 10, 11, 12].map((suffix) => id("interaction", suffix))),
            "History lost ties/future rows or inferred a company conversation.",
          );
          assert(
            !second.hasMore &&
              second.nextCursor === null &&
              second.items[0]?.summaryPreview === literal,
            "Exhausted history or literal preview changed.",
          );
          const archived = await read({ ...request, includeArchived: true, limit: 100 });
          assert(
            archived.items.length === 5 && archived.items.at(-1)?.currentJob.archivedAt === later,
            "Explicit archive inclusion lost linked jobs.",
          );
          assert(
            !JSON.stringify(archived).includes("private"),
            "History exposed contact methods or notes.",
          );
          const foreign = await pageQuery.execute(
            { ...request, expectedVaultId: id("vault", 99) },
            context,
          );
          assert(
            !foreign.ok && foreign.error.code === "not_found",
            "Foreign vault received history.",
          );
          const rebound = await pageQuery.execute(
            { ...request, includeArchived: true, after: first.nextCursor },
            context,
          );
          assert(
            !rebound.ok && rebound.error.code === "validation",
            "Cursor rebound archive scope.",
          );
          assert((await snapshot(database)) === before, "History reads changed canonical records.");
          const projections = statements.filter((statement) =>
            statement.sql.includes("ORDER BY i.occurred_at"),
          );
          assert(
            projections.length === 3 &&
              projections.every(
                (statement) =>
                  statement.sql.includes("substr(CAST(i.summary AS BLOB), 1, ?)") &&
                  statement.sql.includes("LIMIT ?") &&
                  !statement.sql.includes(contactId) &&
                  !/i\.summary\s*,/u.test(statement.sql) &&
                  statement.parameters[0] === 1_024,
              ),
            "Page projection lost byte bounds or parameter binding.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE job SET title=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              ["Explicit synthetic current-title edit", later, jobId],
            ),
          );
          const changed = await snapshot(database);
          const stale = await pageQuery.execute({ ...request, after: first.nextCursor }, context);
          assert(
            !stale.ok && stale.error.code === "conflict",
            "Edited job silently rebound continuation.",
          );
          assert((await snapshot(database)) === changed, "Rejected continuation changed records.");
          await database.execute(
            sqlStatement(
              "UPDATE contact SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              [later, later, contactId],
            ),
          );
          const hidden = await pageQuery.execute(request, context);
          assert(
            !hidden.ok && hidden.error.code === "not_found",
            "Archived contact became empty active history.",
          );
          assert(
            (await read({ ...request, includeArchived: true, limit: 100 })).items.length === 5,
            "Explicit contact/job archive scope did not compose.",
          );
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactHistory.cases
          .readLiteralSummary,
        run: async (database) => {
          await setup.migrate(database);
          await seed(database);
          const body =
            "\uFEFF" + "a".repeat(1_020) + "😀\0<script>literal</script>" + "尾\n".repeat(5_000);
          await insert(database, 10, body);
          await insert(database, 11, "");
          const { read, summaryQuery, statements } = observeReads(database);
          const before = await snapshot(database);
          const page = await read();
          const item = page.items[0];
          assert(
            item !== undefined &&
              item.summaryTruncated &&
              new TextEncoder().encode(item.summaryPreview).byteLength === 1_023,
            "Preview cut a scalar or hid truncation.",
          );
          assert(
            item.summaryByteLength === new TextEncoder().encode(body).byteLength,
            "NUL or Unicode changed summary byte length.",
          );
          const reference = referenceFor(page);
          const input = {
            specVersion: 1 as const,
            reference,
            summaryByteLength: item.summaryByteLength,
            limitBytes: 4_097,
          };
          let offset = 0;
          let text = "";
          let complete = false;
          for (let count = 0; count < 20; count += 1) {
            const result = await summaryQuery.execute({ ...input, byteOffset: offset }, context);
            assert(result.ok, "Valid summary part was rejected.");
            text += result.value.text;
            if (result.value.nextByteOffset === null) {
              complete = true;
              break;
            }
            assert(result.value.nextByteOffset > offset, "Summary parts made no byte progress.");
            offset = result.value.nextByteOffset;
          }
          assert(
            complete && text === body,
            "Full literal summary lost BOM/NUL/Unicode/markup-shaped text.",
          );
          for (const altered of [
            { ...input, byteOffset: 1, limitBytes: 4 },
            { ...input, summaryByteLength: item.summaryByteLength + 1 },
            { ...input, reference: { ...reference, jobRowVersion: reference.jobRowVersion + 1 } },
          ]) {
            const result = await summaryQuery.execute(altered, context);
            assert(
              !result.ok && result.error.code === "conflict",
              "Changed summary reference/length/offset was accepted.",
            );
          }
          for (const altered of [
            { ...reference, vaultId: id("vault", 99) },
            { ...reference, contactId: id("contact", 6) },
          ]) {
            const result = await summaryQuery.execute({ ...input, reference: altered }, context);
            assert(
              !result.ok &&
                result.error.code === "not_found" &&
                !JSON.stringify(result).includes("literal"),
              "Foreign scope received a summary or was labeled empty.",
            );
          }
          const emptyPage = { ...page, items: page.items.slice(1) };
          const empty = await summaryQuery.execute(
            { specVersion: 1, reference: referenceFor(emptyPage), summaryByteLength: 0 },
            context,
          );
          assert(
            empty.ok &&
              empty.value.text === "" &&
              empty.value.bytesRead === 0 &&
              !empty.value.hasMore,
            "Stored empty summary became missing or truncated.",
          );
          assert((await snapshot(database)) === before, "Summary reads changed canonical records.");
          assert(
            statements
              .filter((statement) => statement.sql.includes("AS summary_bytes"))
              .every(
                (statement) =>
                  statement.sql.includes("substr(CAST(i.summary AS BLOB),") &&
                  !statement.sql.includes(contactId),
              ),
            "Summary read fetched unbounded text or interpolated identity.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact SET notes=?,updated_at=?,row_version=row_version+1 WHERE id=?",
              ["Explicit synthetic owner edit", later, contactId],
            ),
          );
          const stale = await summaryQuery.execute(input, context);
          assert(
            !stale.ok && stale.error.code === "conflict",
            "Edited owner silently rebound full summary.",
          );
        },
      },
    ],
  );
