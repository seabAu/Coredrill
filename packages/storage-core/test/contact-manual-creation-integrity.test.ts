import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const id = (suffix: number) => `0198e105-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const at = "2026-10-21T12:00:00.000Z";
const nameHash = createHash("sha256").update("Synthetic").digest("hex");

describe("immutable manual creation evidence under SQLite replacement semantics", () => {
  it.each(["operation_identity", "hidden_rowid"] as const)(
    "rejects alternate %s replacement without relying on recursive delete triggers",
    (mode) => {
      const database = new DatabaseSync(":memory:");
      try {
        database.exec(
          "PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA recursive_triggers=OFF;",
        );
        for (const filename of readdirSync(path.join(root, "migrations"))
          .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
          .sort())
          database.exec(readFileSync(path.join(root, "migrations", filename), "utf8"));
        for (const suffix of [1, 2])
          database
            .prepare(
              "INSERT INTO contact(id,name,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?)",
            )
            .run(id(suffix), "Synthetic", 1, at, at);
        database
          .prepare(
            "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
          )
          .run(id(1), id(3), at, nameHash);
        expect(() => {
          if (mode === "operation_identity")
            database
              .prepare(
                "INSERT OR REPLACE INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
              )
              .run(id(2), id(3), at, nameHash);
          else {
            const row = database
              .prepare("SELECT rowid FROM contact_manual_creation WHERE contact_id=?")
              .get(id(1));
            if (row === undefined) throw new Error("Missing initial evidence.");
            database
              .prepare(
                "INSERT OR REPLACE INTO contact_manual_creation(rowid,contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?,?)",
              )
              .run(row["rowid"] ?? null, id(2), id(4), at, nameHash);
          }
        }).toThrow();
        expect(
          database
            .prepare(
              "SELECT contact_id,operation_id FROM contact_manual_creation ORDER BY contact_id",
            )
            .all(),
        ).toEqual([{ contact_id: id(1), operation_id: id(3) }]);
        expect(database.prepare("SELECT id FROM contact ORDER BY id").all()).toEqual([
          { id: id(1) },
          { id: id(2) },
        ]);
      } finally {
        database.close();
      }
    },
  );
});
