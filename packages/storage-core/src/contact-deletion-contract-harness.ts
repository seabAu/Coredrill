import { defineDatabaseContractSuite, DatabaseContractViolation } from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import { createPortableDataExportV1 } from "./portable-data-export.js";
import { entityId } from "@coredrill/domain";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const id = (n: number) => `0198e110-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T19:00:00.000Z";
const vaultId = entityId("vault", id(1));
const literal = "\uFEFFSynthetic recorded note\0<script>inert</script>尾😀";
const snapshot = async (database: DatabasePort) => ({
  contacts: await database.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
  receipts: await database.query(
    sqlStatement("SELECT * FROM contact_manual_creation ORDER BY contact_id"),
  ),
  links: await database.query(sqlStatement("SELECT * FROM contact_point_provenance ORDER BY id")),
  jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
  sources: await database.query(sqlStatement("SELECT * FROM job_source ORDER BY id")),
  snapshots: await database.query(sqlStatement("SELECT * FROM source_snapshot ORDER BY id")),
  provenance: await database.query(sqlStatement("SELECT * FROM provenance ORDER BY id")),
  interactions: await database.query(
    sqlStatement(
      "SELECT id,job_id,contact_id,type,occurred_at,direction,CAST(summary AS BLOB) AS summary_bytes,next_action_at,created_at,updated_at,row_version FROM interaction ORDER BY id",
    ),
  ),
});
const rejected = async (work: () => Promise<unknown>) => {
  let failed = false;
  try {
    await work();
  } catch {
    failed = true;
  }
  assert(failed, "A forbidden contact/history operation succeeded.");
};

export const createContactDeletionContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactDeletion.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactDeletion.cases.preserveHistory,
        run: async (database) => {
          await setup.migrate(database, 165);
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,165,?,?)",
              [vaultId, "Synthetic deletion contract", at, at],
            ),
          );
          await database.execute(
            sqlStatement("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)", [
              id(4),
              "Synthetic shared job",
              at,
              at,
            ]),
          );
          for (const n of [2, 3]) {
            await database.execute(
              sqlStatement(
                "INSERT INTO contact(id,name,user_confirmed,created_at,updated_at) VALUES(?,?,1,?,?)",
                [id(n), `Synthetic contact ${String(n)}`, at, at],
              ),
            );
            const bytes = await globalThis.crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(`Synthetic contact ${String(n)}`),
            );
            const hash = Array.from(new Uint8Array(bytes), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            await database.execute(
              sqlStatement(
                "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
                [id(n), id(n + 10), at, hash],
              ),
            );
          }
          await database.execute(
            sqlStatement(
              "INSERT INTO job_source(id,job_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
              [id(8), id(4), at, at, at, at],
            ),
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,created_at) VALUES(?,?,?,'synthetic','1',?,'synthetic',?)",
              [id(9), id(8), at, "a".repeat(64), at],
            ),
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,created_at) VALUES(?,?,'user','/synthetic',?,1,?,?)",
              [id(10), id(9), literal, at, at],
            ),
          );
          for (const n of [2, 3])
            await database.execute(
              sqlStatement(
                "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,'name',?,?,?)",
                [id(n + 20), id(n), "b".repeat(64), id(10), at],
              ),
            );
          for (const n of [5, 6, 7])
            await database.execute(
              sqlStatement(
                "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
                [id(n), id(4), id(n === 7 ? 3 : 2), at, literal, at, at],
              ),
            );
          const before = await snapshot(database);
          const baseline = JSON.stringify(before);
          const oldLedger = await database.query(
            sqlStatement("SELECT * FROM coredrill_schema_migration ORDER BY version"),
          );
          const oldExport = await createPortableDataExportV1({
            database,
            vaultId,
            generatedAt: at,
          });
          await rejected(() =>
            database.execute(sqlStatement("DELETE FROM contact WHERE id=?", [id(2)])),
          );
          assert(
            JSON.stringify(await snapshot(database)) === baseline,
            "Baseline failed deletion changed data.",
          );
          await setup.migrate(database);
          assert(
            (await database.diagnostics()).schemaVersion === 167,
            "Deletion guard milestone is not installed.",
          );
          const ledger = await database.query(
            sqlStatement("SELECT * FROM coredrill_schema_migration ORDER BY version"),
          );
          assert(
            ledger.length === 167 &&
              JSON.stringify(ledger.slice(0, 165)) === JSON.stringify(oldLedger),
            "Guard upgrade changed prior migration identities.",
          );
          assert(
            JSON.stringify(await snapshot(database)) === baseline,
            "Guard upgrade rewrote canonical data.",
          );
          const currentExport = await createPortableDataExportV1({
            database,
            vaultId,
            generatedAt: at,
          });
          assert(
            currentExport.sourceSchemaVersion === 167 &&
              currentExport.datasetCount === 58 &&
              currentExport.dataFiles.length === 116 &&
              JSON.stringify(currentExport.datasets) ===
                JSON.stringify(
                  oldExport.datasets.map((dataset) => ({ ...dataset, sourceSchemaVersion: 167 })),
                ),
            "Guard upgrade changed canonical export fields.",
          );
          const first = before.interactions[0];
          assert(
            first?.["summary_bytes"] instanceof Uint8Array &&
              JSON.stringify(Array.from(first["summary_bytes"])) ===
                JSON.stringify(Array.from(new TextEncoder().encode(literal))),
            "History literal bytes were not retained exactly.",
          );
          for (const [column, value] of [
            ["contact_id", null],
            ["contact_id", id(3)],
            ["summary", "changed"],
            ["row_version", 2],
            ["updated_at", "2026-10-24T20:00:00.000Z"],
          ] as const) {
            await rejected(() =>
              database.execute(
                sqlStatement(`UPDATE interaction SET ${column}=? WHERE id=?`, [value, id(5)]),
              ),
            );
            assert(
              JSON.stringify(await snapshot(database)) === baseline,
              "Rejected history update changed data.",
            );
          }
          await rejected(() =>
            database.transaction(async (tx) => {
              await tx.execute(sqlStatement("DELETE FROM contact WHERE id=?", [id(2)]));
              const detached = await tx.query(
                sqlStatement("SELECT contact_id FROM interaction WHERE id=?", [id(5)]),
              );
              assert(
                detached[0]?.["contact_id"] === null,
                "Injected failure preceded actual detachment.",
              );
              throw new Error("Synthetic failure after actual deletion.");
            }),
          );
          assert(
            JSON.stringify(await snapshot(database)) === baseline,
            "Late deletion failure did not roll back all data.",
          );
          await database.transaction(async (tx) => {
            await tx.execute(sqlStatement("DELETE FROM contact WHERE id=?", [id(2)]));
          });
          const after = await snapshot(database);
          assert(
            JSON.stringify(after) ===
              JSON.stringify({
                ...before,
                contacts: before.contacts.filter((row) => row["id"] !== id(2)),
                receipts: before.receipts.filter((row) => row["contact_id"] !== id(2)),
                links: before.links.filter((row) => row["contact_id"] !== id(2)),
                interactions: before.interactions.map((row) =>
                  row["contact_id"] === id(2) ? { ...row, contact_id: null } : row,
                ),
              }),
            "Deletion changed retained history, unrelated contacts or shared source evidence.",
          );
          await rejected(() =>
            database.execute(
              sqlStatement("UPDATE interaction SET contact_id=? WHERE id=?", [id(3), id(5)]),
            ),
          );
          assert(
            JSON.stringify(await snapshot(database)) === JSON.stringify(after),
            "Detached history was rebound.",
          );
          assert(
            (
              await database.query(
                sqlStatement(`
              SELECT i.id FROM interaction i LEFT JOIN contact c ON c.id=i.contact_id
              WHERE i.contact_id IS NOT NULL AND c.id IS NULL
              UNION ALL
              SELECT r.contact_id FROM contact_manual_creation r LEFT JOIN contact c ON c.id=r.contact_id
              WHERE c.id IS NULL
              UNION ALL
              SELECT l.id FROM contact_point_provenance l
              LEFT JOIN contact c ON c.id=l.contact_id LEFT JOIN provenance p ON p.id=l.provenance_id
              WHERE c.id IS NULL OR p.id IS NULL
            `),
              )
            ).length === 0,
            "Deletion left dangling contact/history/evidence relationships.",
          );
        },
      },
    ],
  );
