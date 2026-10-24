import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Isolated synthetic preflight, not an installed migration or a deletion command.
const root = path.resolve(import.meta.dirname, "..", "..");
const migrations = readdirSync(path.join(root, "migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name) && Number(name.slice(0, 4)) <= 165)
  .sort();
assert.equal(migrations.length, 165, "The preserved baseline requires exactly migrations1–165.");
const id = (n) => `0198e108-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-24T19:00:00.000Z";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const immutableColumns = [
  "id",
  "job_id",
  "type",
  "occurred_at",
  "direction",
  "summary",
  "next_action_at",
  "created_at",
  "updated_at",
  "row_version",
];
const candidate = `
  DROP TRIGGER interaction_immutable_update_guard;
  CREATE TRIGGER interaction_immutable_update_guard
  BEFORE UPDATE ON interaction FOR EACH ROW
  WHEN NOT (
    OLD.contact_id IS NOT NULL AND NEW.contact_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = OLD.contact_id)
    AND ${immutableColumns.map((column) => `NEW.${column} IS OLD.${column}`).join(" AND ")}
  ) BEGIN
    SELECT RAISE(ABORT, 'interactions are append-only');
  END;
`;

function fixture(withCandidate, recursiveTriggers) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA recursive_triggers=OFF;");
    for (const name of migrations)
      db.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
    db.exec(`PRAGMA recursive_triggers=${recursiveTriggers ? "ON" : "OFF"};`);
    assert.deepEqual(
      db
        .prepare("PRAGMA table_info(interaction)")
        .all()
        .map((column) => column.name)
        .filter((name) => name !== "contact_id")
        .sort(),
      [...immutableColumns].sort(),
      "Candidate must compare every other stored history column.",
    );
    db.prepare("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)").run(
      id(1),
      "Synthetic lifecycle job",
      at,
      at,
    );
    for (const n of [2, 3, 6]) {
      const name = `Synthetic contact ${n}`;
      db.prepare(
        "INSERT INTO contact(id,name,user_confirmed,created_at,updated_at) VALUES(?,?,1,?,?)",
      ).run(id(n), name, at, at);
      db.prepare(
        "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
      ).run(id(n), id(n + 10), at, digest(name));
    }
    for (const n of [4, 5, 7])
      db.prepare(
        "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
      ).run(
        id(n),
        id(1),
        id(n === 7 ? 6 : 2),
        at,
        `\uFEFFSynthetic ${n}\0<script>inert</script>`,
        at,
        at,
      );
    if (withCandidate) db.exec(candidate);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function snapshot(db) {
  return Object.fromEntries(
    ["contact", "contact_manual_creation", "interaction", "job"].map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table} ORDER BY 1`)
        .all()
        .map((row) => ({ ...row })),
    ]),
  );
}
function rejectsUnchanged(db, sql, parameters = []) {
  const before = snapshot(db);
  assert.throws(() => db.prepare(sql).run(...parameters), /interactions are append-only/u);
  assert.deepEqual(snapshot(db), before);
}

let baselineCases = 0;
let candidateCases = 0;
for (const [withCandidate, recursiveTriggers] of [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
]) {
  const db = fixture(withCandidate, recursiveTriggers);
  try {
    const original = snapshot(db);
    db.prepare("DELETE FROM contact WHERE id=?").run(id(3));
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM contact_manual_creation WHERE contact_id=?").get(id(3))
        .n,
      0,
    );
    assert.deepEqual(snapshot(db).interaction, original.interaction);
    if (withCandidate) candidateCases += 1;
    else baselineCases += 1;

    for (const [sql, parameters] of [
      ["UPDATE interaction SET contact_id=NULL WHERE id=?", [id(4)]],
      ["UPDATE interaction SET contact_id=? WHERE id=?", [id(3), id(4)]],
      ["UPDATE interaction SET summary='changed' WHERE id=?", [id(4)]],
      ["UPDATE interaction SET row_version=row_version+1 WHERE id=?", [id(4)]],
      ["UPDATE interaction SET updated_at=? WHERE id=?", ["2026-10-24T20:00:00.000Z", id(4)]],
      ["UPDATE interaction SET contact_id=NULL,summary='changed' WHERE id=?", [id(4)]],
    ]) {
      rejectsUnchanged(db, sql, parameters);
      if (withCandidate) candidateCases += 1;
      else baselineCases += 1;
    }
    if (!withCandidate) {
      rejectsUnchanged(db, "DELETE FROM contact WHERE id=?", [id(2)]);
      baselineCases += 1;
    } else {
      // A later cascade failure must restore the parent, its receipt and all history.
      const beforeFailure = snapshot(db);
      db.exec(`CREATE TRIGGER synthetic_detachment_failure AFTER UPDATE OF contact_id ON interaction
        WHEN OLD.contact_id IS NOT NULL AND NEW.contact_id IS NULL
        BEGIN SELECT RAISE(ABORT, 'synthetic detachment failure'); END;`);
      assert.throws(
        () => db.prepare("DELETE FROM contact WHERE id=?").run(id(2)),
        /synthetic detachment failure/u,
      );
      assert.deepEqual(snapshot(db), beforeFailure);
      db.exec("DROP TRIGGER synthetic_detachment_failure;");
      candidateCases += 1;
      const before = snapshot(db);
      db.prepare("DELETE FROM contact WHERE id=?").run(id(2));
      assert.deepEqual(
        snapshot(db).interaction,
        before.interaction.map((row) =>
          row.contact_id === id(2) ? { ...row, contact_id: null } : row,
        ),
      );
      assert.deepEqual(snapshot(db).job, before.job);
      assert.deepEqual(
        snapshot(db).contact,
        before.contact.filter((row) => row.id !== id(2)),
      );
      assert.deepEqual(
        snapshot(db).contact_manual_creation,
        before.contact_manual_creation.filter((row) => row.contact_id !== id(2)),
      );
      candidateCases += 1;
      rejectsUnchanged(db, "UPDATE interaction SET contact_id=? WHERE id=?", [id(2), id(4)]);
      candidateCases += 1;
    }
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
}
console.log(
  "CONTACT_FIELD_USE_LIFECYCLE_AUDIT",
  JSON.stringify({
    schemaVersion: migrations.length,
    baselineCases,
    candidateCases,
    linkedDeletionRejectedAtBaseline: true,
    scratchCandidatePreservesOtherHistoryColumns: true,
    productionMigrationInstalled: false,
    normalDeletionImplemented: false,
    fieldUseQualificationImplemented: false,
  }),
);
