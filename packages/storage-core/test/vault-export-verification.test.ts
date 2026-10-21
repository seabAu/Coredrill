import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  BROWSER_EXPORT_REMINDER_SETTING_KEY,
  VAULT_EXPORT_VERIFICATION_SETTING_KEY,
  type VaultExportObservation,
  type VaultExportVerificationView,
} from "@coredrill/application";
import {
  applySqlMigrations,
  defineSqlMigrations,
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type QueryRow,
  type SqlStatement,
} from "../src/index.js";
import { createSqliteVaultExportVerificationPort } from "../src/vault-export-verification.js";

const root = path.resolve(import.meta.dirname, "../../..");
const vaultId = "0198e102-0000-7000-8000-000000000001";
const otherId = "0198e102-0000-7000-8000-000000000003";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const now = "2026-10-21T10:00:00.000Z";
const observation = (second = 1): VaultExportObservation => ({
  archiveId,
  archiveCreatedAt: "2026-10-21T08:00:00.000Z",
  schemaVersion: 160,
  byteLength: 1024,
  sha256: "a".repeat(64),
  method: "native_readback",
  verifiedAt: new Date(Date.parse("2026-10-21T09:00:00.000Z") + second * 1000).toISOString(),
});
const migrations = defineSqlMigrations(
  readdirSync(path.join(root, "migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
    .map((name, index) => {
      const sql = readFileSync(path.join(root, "migrations", name), "utf8");
      return {
        version: index + 1,
        name: name.slice(5, -4).replaceAll("_", "-"),
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
);
const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});
const setup = async () => {
  const connection = new DatabaseSync(":memory:");
  connections.push(connection);
  connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  let failReminderWrite = false;
  const query = async <Row extends QueryRow = QueryRow>(statement: SqlStatement) =>
    connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  const execute = async (statement: SqlStatement) => {
    if (
      failReminderWrite &&
      statement.parameters[0] === BROWSER_EXPORT_REMINDER_SETTING_KEY &&
      statement.sql.startsWith("INSERT INTO app_setting")
    )
      throw new Error("SYNTHETIC_PRIVATE_WRITE_FAILURE");
    return {
      rowsAffected: Number(connection.prepare(statement.sql).run(...statement.parameters).changes),
    };
  };
  const database: DatabasePort = {
    query,
    execute,
    transaction: async <Result>(work: (tx: DatabaseTransaction) => Promise<Result>) => {
      connection.exec("BEGIN IMMEDIATE");
      try {
        const result = await work({ query, execute });
        connection.exec("COMMIT");
        return result;
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
    exportPortable: async () => {
      throw new Error("Export not used by observation storage");
    },
    diagnostics: async () => {
      throw new Error("Diagnostics not used by observation storage");
    },
  };
  await applySqlMigrations(database, migrations, now);
  await database.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES (?, ?, 160, ?, ?)",
      [vaultId, "Synthetic verification vault", now, now],
    ),
  );
  const rows = () => connection.prepare("SELECT * FROM app_setting ORDER BY key").all();
  return {
    connection,
    database,
    port: createSqliteVaultExportVerificationPort(database),
    rows,
    failReminder: () => {
      failReminderWrite = true;
    },
  };
};
const recorded = (
  port: ReturnType<typeof createSqliteVaultExportVerificationPort>,
  item = observation(),
) =>
  port.record({
    vaultId,
    observation: item,
    recordedAt: now,
  }) as Promise<VaultExportVerificationView>;

describe("vault-bound SQLite export verification observations", () => {
  it("reads missing history/preferences without writes and stores both only after explicit record", async () => {
    const fixture = await setup();
    expect(await fixture.port.read({ vaultId })).toMatchObject({
      history: { vaultId, observations: [] },
      reminder: { enabled: true, lastSuccessfulExportAtUnixMs: null },
    });
    expect(fixture.rows()).toEqual([]);
    expect(await recorded(fixture.port)).toMatchObject({
      history: { observations: [observation()] },
      reminder: { lastSuccessfulExportAtUnixMs: Date.parse(observation().verifiedAt) },
    });
    expect(fixture.rows()).toHaveLength(2);
  });

  it("preserves disabled preference and monotonic time; exact retry does not undo later user actions", async () => {
    const fixture = await setup();
    await fixture.port.updateReminder({ vaultId, action: "disable", updatedAt: now });
    expect(await recorded(fixture.port, observation(10))).toMatchObject({
      reminder: { enabled: false },
    });
    const older = await recorded(fixture.port, observation(1));
    expect(older.reminder).toMatchObject({
      enabled: false,
      lastSuccessfulExportAtUnixMs: Date.parse(observation(10).verifiedAt),
    });
    await fixture.port.updateReminder({ vaultId, action: "snooze", updatedAt: now });
    const before = fixture.rows();
    expect(await recorded(fixture.port, observation(1))).toMatchObject({
      reminder: { enabled: true, snoozedUntilUnixMs: Date.parse(now) + 7 * 86400_000 },
    });
    expect(fixture.rows()).toEqual(before);
  });

  it("rolls history back if the following reminder write fails", async () => {
    const fixture = await setup();
    await fixture.port.updateReminder({ vaultId, action: "disable", updatedAt: now });
    const before = fixture.rows();
    fixture.failReminder();
    await expect(recorded(fixture.port)).rejects.toThrow();
    expect(fixture.rows()).toEqual(before);
    expect(await fixture.port.read({ vaultId })).toMatchObject({
      history: { observations: [] },
      reminder: { enabled: false },
    });
  });

  it("rejects absent, wrong and multiple current vaults without settings changes", async () => {
    const fixture = await setup();
    await expect(fixture.port.read({ vaultId: otherId })).rejects.toMatchObject({
      code: "conflict",
    });
    fixture.connection.prepare("UPDATE vault SET id = ?").run(otherId);
    await expect(recorded(fixture.port)).rejects.toMatchObject({ code: "conflict" });
    fixture.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES (?, 'Synthetic extra', 160, ?, ?)",
      )
      .run(vaultId, now, now);
    await expect(recorded(fixture.port)).rejects.toMatchObject({ code: "conflict" });
    fixture.connection.exec("DELETE FROM vault");
    await expect(recorded(fixture.port)).rejects.toMatchObject({ code: "not_found" });
    expect(fixture.rows()).toEqual([]);
  });

  it.each(["malformed-history", "foreign-history", "malformed-reminder"])(
    "never resets %s into fake empty/default success",
    async (kind) => {
      const fixture = await setup();
      const key =
        kind === "malformed-reminder"
          ? BROWSER_EXPORT_REMINDER_SETTING_KEY
          : VAULT_EXPORT_VERIFICATION_SETTING_KEY;
      const value =
        kind === "foreign-history"
          ? { version: 1, vaultId: otherId, observations: [] }
          : { version: 999, private: "synthetic invalid" };
      fixture.connection
        .prepare("INSERT INTO app_setting(key,json_value,updated_at) VALUES (?, ?, ?)")
        .run(key, JSON.stringify(value), now);
      const before = fixture.rows();
      await expect(fixture.port.read({ vaultId })).rejects.toMatchObject({
        code: kind === "foreign-history" ? "conflict" : "unavailable",
      });
      await expect(recorded(fixture.port)).rejects.toThrow();
      await expect(
        fixture.port.updateReminder({ vaultId, action: "enable", updatedAt: now }),
      ).rejects.toThrow();
      expect(fixture.rows()).toEqual(before);
    },
  );

  it("rejects conflicting archive tuples, old retention-window evidence and future instants without partial writes", async () => {
    const fixture = await setup();
    for (let index = 1; index <= 21; index += 1) await recorded(fixture.port, observation(index));
    const before = fixture.rows();
    await expect(recorded(fixture.port, observation(1))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(
      recorded(fixture.port, { ...observation(22), sha256: "b".repeat(64) }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      recorded(fixture.port, { ...observation(22), verifiedAt: "2026-10-22T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(fixture.rows()).toEqual(before);
  });

  it("copies the original input before transaction awaits", async () => {
    const fixture = await setup();
    const input = { vaultId, observation: { ...observation() }, recordedAt: now };
    const pending = fixture.port.record(input);
    input.vaultId = otherId;
    input.observation.sha256 = "b".repeat(64);
    expect(await pending).toMatchObject({ history: { vaultId, observations: [observation()] } });
  });
});
