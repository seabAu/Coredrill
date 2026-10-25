import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect } from "@playwright/test";
import { PORTABLE_DATA_EXPORT_DATASETS } from "../packages/storage-core/dist/index.js";

export const qualificationDatasetNames = [
  "contact_source_snapshot",
  "contact_source_use_policy",
  "contact_field_use_review",
];
export const expectedQualificationGuards = async () => {
  const files = [
    "0169_contact_source_snapshot_insert_guard.sql",
    "0170_contact_source_snapshot_update_guard.sql",
    "0172_contact_source_use_policy_insert_guard.sql",
    "0173_contact_source_use_policy_update_guard.sql",
    "0175_contact_field_use_review_insert_guard.sql",
    "0176_contact_field_use_review_update_guard.sql",
    "0177_contact_field_use_review_delete_guard.sql",
  ];
  return (
    await Promise.all(
      files.map(async (file) => {
        const sql = (await readFile(path.resolve("migrations", file), "utf8"))
          .trim()
          .replace(/;$/u, "");
        return { name: /^CREATE TRIGGER ([a-z_]+)/u.exec(sql)?.[1], sql };
      }),
    )
  ).sort((a, b) => a.name.localeCompare(b.name));
};

export const callHarness = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const harness = globalThis.coredrillStorageSpike;
      if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
      return value === undefined ? harness[methodName]() : harness[methodName](value);
    },
    { methodName: method, value: argument },
  );

export const openHarness = async (context) => {
  const page = await context.newPage();
  await page.goto("/storage-verification.html");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

export const readCanonicalSnapshot = async (bytes, filename) => {
  await writeFile(filename, bytes);
  const database = new DatabaseSync(filename, { readOnly: true });
  const identifier = (value) => {
    if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error("Unreviewed SQL identifier.");
    return `"${value}"`;
  };
  try {
    const schemaVersion = database.prepare("PRAGMA user_version").get().user_version;
    return {
      schemaVersion,
      datasets: PORTABLE_DATA_EXPORT_DATASETS.filter(
        (spec) => (spec.minimumSourceSchemaVersion ?? 0) <= schemaVersion,
      ).map((spec) => ({
        name: spec.name,
        rows: database
          .prepare(
            `SELECT ${spec.columns.map(identifier).join(", ")} FROM ${identifier(spec.table)} ORDER BY ${spec.orderBy.map(identifier).join(", ")}`,
          )
          .all(),
      })),
      ledger: database
        .prepare("SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version")
        .all(),
      index: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("next_action_job_created_idx"),
      reminderIndex: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("reminder_next_action_job_state_idx"),
      contactHistoryIndex: database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?")
        .all("interaction_contact_history_idx"),
      qualificationGuards: database
        .prepare(
          "SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name GLOB 'contact_*' AND (name GLOB 'contact_source_*' OR name GLOB 'contact_field_use_*') ORDER BY name",
        )
        .all(),
      interactionGuard: database
        .prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name=?")
        .all("interaction_immutable_update_guard"),
    };
  } finally {
    database.close();
  }
};
