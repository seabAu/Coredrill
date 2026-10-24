import {
  createContactDeletionOperations,
  type ApplicationResult,
  type ContactDeletionResultV1,
  type ContactDeletionTargetV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { defineDatabaseContractSuite, DatabaseContractViolation } from "./contract-harness.js";
import { createContactDeletionRepository } from "./contact-deletion-repository.js";
import { sqlStatement, type DatabasePort, type DatabaseTransaction } from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const id = (n: number) => `0198e115-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T19:00:00.000Z");
const literal = "\uFEFFSynthetic retained interaction\0<script>inert</script>尾😀";
const context = { operationId: entityId("application-operation", id(30)), initiatedAt: at };
const target: ContactDeletionTargetV1 = {
  specVersion: 1,
  expectedVaultId: entityId("vault", id(1)),
  contactId: entityId("contact", id(2)),
  expectedRowVersion: 1,
  expectedCreatedAt: at,
  expectedUpdatedAt: at,
  expectedArchivedAt: null,
  expectedCompanyId: entityId("company", id(2)),
  expectedManualCreationOperationId: entityId("application-operation", id(9)),
};
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const capture = async (db: DatabasePort) => ({
  vault: await db.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
  company: await db.query(sqlStatement("SELECT * FROM company ORDER BY id")),
  contacts: await db.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
  receipts: await db.query(
    sqlStatement("SELECT * FROM contact_manual_creation ORDER BY contact_id"),
  ),
  links: await db.query(sqlStatement("SELECT * FROM contact_point_provenance ORDER BY id")),
  values: await db.query(sqlStatement("SELECT * FROM field_value ORDER BY id")),
  jobs: await db.query(sqlStatement("SELECT * FROM job ORDER BY id")),
  sources: await db.query(sqlStatement("SELECT * FROM job_source ORDER BY id")),
  snapshots: await db.query(sqlStatement("SELECT * FROM source_snapshot ORDER BY id")),
  provenance: await db.query(sqlStatement("SELECT * FROM provenance ORDER BY id")),
  applications: await db.query(sqlStatement("SELECT * FROM application ORDER BY id")),
  interviews: await db.query(sqlStatement("SELECT * FROM interview ORDER BY id")),
  interactions: await db.query(
    sqlStatement(
      "SELECT id,job_id,contact_id,type,occurred_at,direction,CAST(summary AS BLOB) AS summary_bytes,next_action_at,created_at,updated_at,row_version FROM interaction ORDER BY id",
    ),
  ),
});
const expectState = (result: ApplicationResult<ContactDeletionResultV1>, state: string) => {
  assert(result.ok, "The viewed deletion operation did not succeed.");
  assert(result.value.state === state, "The viewed deletion outcome was misrepresented.");
};
const expectFailure = (result: ApplicationResult<ContactDeletionResultV1>, code: string) => {
  assert(!result.ok && result.error.code === code, "A rejected deletion did not fail safely.");
};
const failingPort = (db: DatabasePort): DatabasePort => ({
  query: (statement) => db.query(statement),
  execute: (statement) => db.execute(statement),
  diagnostics: () => db.diagnostics(),
  exportPortable: () => db.exportPortable(),
  transaction: <Result>(work: (session: DatabaseTransaction) => Promise<Result>) =>
    db.transaction((session) =>
      work({
        query: (statement) => session.query(statement),
        execute: async (statement) => {
          const result = await session.execute(statement);
          if (statement.sql.startsWith("DELETE FROM contact "))
            throw new Error("Synthetic failure after actual deletion.");
          return result;
        },
      }),
    ),
});
export const createViewedContactDeletionContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.viewedContactDeletion.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.viewedContactDeletion.cases
          .deleteAndObserve,
        run: async (database) => {
          await setup.migrate(database);
          const execute = (sql: string, parameters: Parameters<typeof sqlStatement>[1] = []) =>
            database.execute(sqlStatement(sql, parameters));
          await execute(
            "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,167,?,?)",
            [id(1), "Synthetic viewed deletion", at, at],
          );
          await execute(
            "INSERT INTO company(id,canonical_name,created_at,updated_at) VALUES(?,?,?,?)",
            [id(2), "Synthetic shared company", at, at],
          );
          for (const n of [2, 12])
            await execute(
              "INSERT INTO contact(id,company_id,name,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
              [id(n), id(2), `Synthetic ${String(n)}`, literal, at, at],
            );
          await execute(
            "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
            [id(2), id(9), at, await hash("Synthetic 2")],
          );
          await execute(
            "INSERT INTO status_definition(id,name,category,sort_order,created_at,updated_at) VALUES(?,'Synthetic saved','saved',0,?,?)",
            [id(8), at, at],
          );
          await execute(
            "INSERT INTO job(id,title,company_id,current_status_id,created_at,updated_at) VALUES(?,'Synthetic job',?,?,?,?)",
            [id(3), id(2), id(8), at, at],
          );
          await execute(
            "INSERT INTO application(id,job_id,current_status_id,created_at,updated_at) VALUES(?,?,?,?,?)",
            [id(10), id(3), id(8), at, at],
          );
          await execute(
            "INSERT INTO interview(id,application_id,stage_name,starts_at,timezone,duration_minutes,contact_ids_json,created_at,updated_at) VALUES(?,?,'Synthetic interview',?,'UTC',30,?,?,?)",
            [id(11), id(10), at, JSON.stringify([id(2), id(12)]), at, at],
          );
          await execute(
            "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
            [id(7), id(3), id(2), at, literal, at, at],
          );
          await execute(
            "INSERT INTO job_source(id,job_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            [id(4), id(3), at, at, at, at],
          );
          await execute(
            "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,raw_text,created_at) VALUES(?,?,?,'synthetic','1',?,'synthetic',?,?)",
            [id(5), id(4), at, "a".repeat(64), literal, at],
          );
          await execute(
            "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,created_at) VALUES(?,?,'user','/synthetic',?,1,?,?)",
            [id(6), id(5), literal, at, at],
          );
          await execute(
            "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,'name',?,?,?)",
            [id(13), id(2), "b".repeat(64), id(6), at],
          );
          for (const [n, kind, replacement] of [
            [20, "contact", null],
            [21, "contact", id(20)],
            [22, "company", null],
          ] as const)
            await execute(
              "INSERT INTO field_value(id,entity_type,entity_id,field_name,normalized_json,provenance_id,superseded_by_id,created_at,updated_at) VALUES(?,?,?,'name',?,?,?,?,?)",
              [id(n), kind, id(2), JSON.stringify(literal), id(6), replacement, at, at],
            );
          await execute(
            "UPDATE field_value SET is_user_confirmed=1,user_confirmation_id=?,confirmed_at=?,confirmed_value_hash=? WHERE id=?",
            [id(50), at, await hash(literal), id(20)],
          );
          await execute("UPDATE field_value SET superseded_by_id=? WHERE id=?", [id(21), id(20)]);
          const before = await capture(database);
          const baseline = JSON.stringify(before);
          const bytes = before.interactions[0]?.["summary_bytes"];
          assert(
            bytes instanceof Uint8Array &&
              JSON.stringify(Array.from(bytes)) ===
                JSON.stringify(Array.from(new TextEncoder().encode(literal))),
            "The original literal history bytes changed.",
          );
          const operations = createContactDeletionOperations(
            createContactDeletionRepository(database),
          );
          expectState(await operations.inspect.execute(target, context), "original_present");
          expectFailure(
            await operations.remove.execute({ ...target, confirmation: "DELETE" }, context),
            "validation",
          );
          expectFailure(
            await operations.remove.execute(
              { ...target, expectedRowVersion: 2, confirmation: "DELETE CONTACT" },
              context,
            ),
            "conflict",
          );
          expectFailure(
            await operations.remove.execute(
              {
                ...target,
                expectedVaultId: entityId("vault", id(99)),
                confirmation: "DELETE CONTACT",
              },
              context,
            ),
            "not_found",
          );
          assert(
            JSON.stringify(await capture(database)) === baseline,
            "Rejected deletion or observation changed canonical facts.",
          );
          const injected = createContactDeletionOperations(
            createContactDeletionRepository(failingPort(database)),
          );
          expectFailure(
            await injected.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
            "internal",
          );
          assert(
            JSON.stringify(await capture(database)) === baseline,
            "An actual late deletion failure did not roll back all rows.",
          );
          await execute("UPDATE field_value SET superseded_by_id=? WHERE id=?", [id(20), id(22)]);
          const restricted = JSON.stringify(await capture(database));
          expectFailure(
            await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
            "internal",
          );
          assert(
            JSON.stringify(await capture(database)) === restricted,
            "External history reference failure changed unrelated data.",
          );
          await execute("UPDATE field_value SET superseded_by_id=NULL WHERE id=?", [id(22)]);
          expectState(
            await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
            "deleted",
          );
          const after = await capture(database);
          assert(
            JSON.stringify(after) ===
              JSON.stringify({
                ...before,
                contacts: before.contacts.filter((row) => row["id"] !== id(2)),
                receipts: [],
                links: [],
                values: before.values.filter((row) => row["entity_type"] !== "contact"),
                interactions: before.interactions.map((row) => ({ ...row, contact_id: null })),
              }),
            "Viewed deletion changed retained history, interviews, other contacts or shared evidence.",
          );
          expectState(await operations.inspect.execute(target, context), "absent_complete");
          expectFailure(
            await operations.remove.execute({ ...target, confirmation: "DELETE CONTACT" }, context),
            "not_found",
          );
          assert(
            JSON.stringify(await capture(database)) === JSON.stringify(after),
            "Observation or replay changed deleted state.",
          );
          const other: ContactDeletionTargetV1 = {
            ...target,
            contactId: entityId("contact", id(12)),
            expectedManualCreationOperationId: null,
          };
          expectState(await operations.inspect.execute(other, context), "original_present");
          await execute(
            "INSERT INTO field_value(id,entity_type,entity_id,field_name,normalized_json,provenance_id,created_at,updated_at) VALUES(?,'contact',?,'name','\"synthetic\"',?,?,?)",
            [id(24), id(12), id(6), at, at],
          );
          await execute("DELETE FROM contact WHERE id=?", [id(12)]);
          const orphaned = JSON.stringify(await capture(database));
          expectState(await operations.inspect.execute(other, context), "unresolved");
          expectFailure(
            await operations.remove.execute({ ...other, confirmation: "DELETE CONTACT" }, context),
            "not_found",
          );
          assert(
            JSON.stringify(await capture(database)) === orphaned,
            "Missing-parent reconciliation silently purged owned candidates.",
          );
        },
      },
    ],
  );
