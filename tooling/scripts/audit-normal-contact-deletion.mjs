import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Synthetic in-memory relationship audit, not a production command or migration runner.
const root = path.resolve(import.meta.dirname, "..", "..");
const files = readdirSync(path.join(root, "migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name) && Number(name.slice(0, 4)) <= 167)
  .sort();
assert.equal(files.length, 167);
const id = (n) => `0198e112-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T19:00:00.000Z";
const literal = "\uFEFFSynthetic historical contact\0<script>inert</script>尾";
const tables = [
  "company",
  "contact",
  "contact_manual_creation",
  "contact_point_provenance",
  "field_value",
  "job",
  "job_source",
  "source_snapshot",
  "provenance",
  "application",
  "interview",
  "interaction",
];
const snapshot = (db) =>
  Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table} ORDER BY 1`)
        .all()
        .map((row) => ({ ...row })),
    ]),
  );
function fixture(recursive) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const file of files) db.exec(readFileSync(path.join(root, "migrations", file), "utf8"));
    db.exec(`PRAGMA recursive_triggers=${recursive ? "ON" : "OFF"}`);
    db.prepare("INSERT INTO company(id,canonical_name,created_at,updated_at) VALUES(?,?,?,?)").run(
      id(2),
      "Synthetic shared company",
      at,
      at,
    );
    for (const n of [2, 3]) {
      const name = `Synthetic contact ${String(n)}`;
      db.prepare(
        "INSERT INTO contact(id,company_id,name,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
      ).run(id(n), id(2), name, literal, at, at);
      db.prepare(
        "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
      ).run(id(n), id(n + 40), at, createHash("sha256").update(name).digest("hex"));
    }
    db.prepare(
      "INSERT INTO status_definition(id,name,category,sort_order,created_at,updated_at) VALUES(?,?,'saved',0,?,?)",
    ).run(id(4), "Synthetic saved", at, at);
    db.prepare(
      "INSERT INTO job(id,title,company_id,current_status_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    ).run(id(1), "Synthetic retained job", id(2), id(4), at, at);
    db.prepare(
      "INSERT INTO application(id,job_id,current_status_id,created_at,updated_at) VALUES(?,?,?,?,?)",
    ).run(id(5), id(1), id(4), at, at);
    db.prepare(
      "INSERT INTO interview(id,application_id,stage_name,starts_at,timezone,duration_minutes,contact_ids_json,created_at,updated_at) VALUES(?,?,?,?, 'UTC',30,?,?,?)",
    ).run(
      id(6),
      id(5),
      "Synthetic historical interview",
      at,
      JSON.stringify([id(2), id(3)]),
      at,
      at,
    );
    db.prepare(
      "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
    ).run(id(7), id(1), id(2), at, literal, at, at);
    db.prepare(
      "INSERT INTO job_source(id,job_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    ).run(id(8), id(1), at, at, at, at);
    db.prepare(
      "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,raw_text,created_at) VALUES(?,?,?,'synthetic','1',?,'synthetic',?,?)",
    ).run(id(9), id(8), at, "a".repeat(64), literal, at);
    db.prepare(
      "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,created_at) VALUES(?,?,'user','/synthetic',?,1,?,?)",
    ).run(id(10), id(9), literal, at, at);
    db.prepare(
      "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,'name',?,?,?)",
    ).run(id(11), id(2), "b".repeat(64), id(10), at);
    // The replacement is inserted first: bulk deletion must not assume a friendly row order.
    for (const [n, kind, replacement] of [
      [20, "contact", null],
      [21, "contact", id(20)],
      [22, "company", null],
    ])
      db.prepare(
        "INSERT INTO field_value(id,entity_type,entity_id,field_name,normalized_json,provenance_id,superseded_by_id,created_at,updated_at) VALUES(?,?,?,'name',?,?,?,?,?)",
      ).run(id(n), kind, id(2), JSON.stringify(literal), id(10), replacement, at, at);
    db.prepare(
      "UPDATE field_value SET is_user_confirmed=1,user_confirmation_id=?,confirmed_at=?,confirmed_value_hash=? WHERE id=?",
    ).run(id(50), at, createHash("sha256").update(JSON.stringify(literal)).digest("hex"), id(20));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function candidate(db) {
  // Candidate only: original-owner/version validation and UI acknowledgement are separate requirements.
  db.prepare(
    "UPDATE field_value SET superseded_by_id=NULL WHERE entity_type='contact' AND entity_id=?",
  ).run(id(2));
  db.prepare("DELETE FROM field_value WHERE entity_type='contact' AND entity_id=?").run(id(2));
  assert.equal(
    db.prepare("DELETE FROM contact WHERE id=? AND row_version=1").run(id(2)).changes,
    1,
  );
}
function transaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
let scenarios = 0;
for (const recursive of [false, true]) {
  for (const mode of ["bare", "bulk", "candidate", "cycle", "external-reference", "late-failure"]) {
    const db = fixture(recursive);
    try {
      if (mode === "cycle")
        db.prepare("UPDATE field_value SET superseded_by_id=? WHERE id=?").run(id(21), id(20));
      if (mode === "external-reference")
        db.prepare("UPDATE field_value SET superseded_by_id=? WHERE id=?").run(id(20), id(22));
      if (mode === "late-failure")
        db.exec(
          "CREATE TRIGGER synthetic_delete_failure AFTER DELETE ON contact BEGIN SELECT RAISE(ABORT,'synthetic late failure'); END",
        );
      const before = snapshot(db);
      if (mode === "bare") {
        db.prepare("DELETE FROM contact WHERE id=?").run(id(2));
        assert.deepEqual(snapshot(db).field_value, before.field_value);
        assert.deepEqual(snapshot(db).interview, before.interview);
      } else if (mode === "bulk") {
        assert.throws(
          () =>
            db
              .prepare("DELETE FROM field_value WHERE entity_type='contact' AND entity_id=?")
              .run(id(2)),
          /FOREIGN KEY/u,
        );
        assert.deepEqual(snapshot(db), before);
      } else if (mode === "candidate" || mode === "cycle") {
        transaction(db, () => candidate(db));
        assert.deepEqual(snapshot(db), {
          ...before,
          contact: before.contact.filter((row) => row.id !== id(2)),
          contact_manual_creation: before.contact_manual_creation.filter(
            (row) => row.contact_id !== id(2),
          ),
          contact_point_provenance: [],
          field_value: before.field_value.filter(
            (row) => row.entity_type !== "contact" || row.entity_id !== id(2),
          ),
          interaction: before.interaction.map((row) => ({ ...row, contact_id: null })),
        });
      } else {
        assert.throws(
          () => transaction(db, () => candidate(db)),
          mode === "external-reference" ? /FOREIGN KEY/u : /synthetic late failure/u,
        );
        assert.deepEqual(snapshot(db), before);
      }
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      scenarios += 1;
    } finally {
      db.close();
    }
  }
}
console.log(
  "NORMAL_CONTACT_DELETION_GRAPH_AUDIT",
  JSON.stringify({
    reviewedSqlThrough: files.length,
    scenarios,
    recursiveTriggerModes: 2,
    bareDeletionRetainsContactFieldValues: true,
    interviewHistoricalIdsPreserved: true,
    bulkHistoryDeletionCanReject: true,
    scopedTransactionalCandidatePreservesOthers: true,
    externalReferencesAndLateFailuresRollBack: true,
    productionCommandImplemented: false,
    normalDeletionUiImplemented: false,
    realVaultsTouched: false,
  }),
);
