import { entityId, instant } from "@coredrill/domain";
import { createDatabaseViewedInteractionPort } from "./application-ports.js";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new DatabaseContractViolation(message);
}
const id = <Kind extends string>(kind: Kind, suffix: number) =>
  entityId(kind, `0198e108-0000-7000-8000-${String(suffix).padStart(12, "0")}`);
const at = instant("2026-10-22T06:00:00.000Z");
const snapshot = async (database: DatabasePort) =>
  JSON.stringify(
    await Promise.all(
      ["vault", "job", "contact", "interaction", "status_event", "next_action", "reminder"].map(
        (table) => database.query(sqlStatement(`SELECT * FROM ${table} ORDER BY 1`)),
      ),
    ),
  );

export const createViewedInteractionContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.interactionRecording.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.interactionRecording.cases
          .recordViewed,
        run: async (database) => {
          await setup.migrate(database);
          const vaultId = id("vault", 1),
            jobId = id("job", 2),
            contactId = id("contact", 3);
          await database.execute(
            sqlStatement("INSERT INTO vault VALUES (?, ?, ?, ?, ?)", [
              vaultId,
              "Synthetic recording",
              (await database.diagnostics()).schemaVersion,
              at,
              at,
            ]),
          );
          await database.execute(
            sqlStatement("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)", [
              jobId,
              "Synthetic role",
              at,
              at,
            ]),
          );
          await database.execute(
            sqlStatement("INSERT INTO contact(id,name,created_at,updated_at) VALUES(?,?,?,?)", [
              contactId,
              "Synthetic explicit contact",
              at,
              at,
            ]),
          );
          const port = createDatabaseViewedInteractionPort(database);
          const input = {
            id: id("interaction", 4),
            jobId,
            contactId,
            type: "call",
            occurredAt: at,
            direction: "mutual" as const,
            summary: "  \uFEFFé中🙂 <script>literal</script>\nExact.  ",
            nextActionAt: null,
            createdAt: at,
            updatedAt: at,
            expected: {
              specVersion: 1 as const,
              expectedVaultId: vaultId,
              jobRowVersion: 1,
              contactRowVersion: 1,
            },
          };
          const rejectsUnchanged = async (work: () => Promise<unknown>) => {
            const before = await snapshot(database);
            let rejected = false;
            try {
              await work();
            } catch {
              rejected = true;
            }
            assert(rejected, "Unsafe interaction write was accepted.");
            assert(
              (await snapshot(database)) === before,
              "Rejected interaction changed canonical records.",
            );
          };
          await rejectsUnchanged(() =>
            port.recordInteraction({
              ...input,
              expected: { ...input.expected, expectedVaultId: jobId },
            }),
          );
          await rejectsUnchanged(() =>
            port.recordInteraction({ ...input, expected: { ...input.expected, jobRowVersion: 2 } }),
          );
          await rejectsUnchanged(() =>
            port.recordInteraction({
              ...input,
              expected: { ...input.expected, contactRowVersion: 2 },
            }),
          );
          await database.execute(
            sqlStatement("INSERT INTO vault VALUES (?, ?, ?, ?, ?)", [
              id("vault", 5),
              "Ambiguous root",
              (await database.diagnostics()).schemaVersion,
              at,
              at,
            ]),
          );
          await rejectsUnchanged(() => port.recordInteraction(input));
          await database.execute(sqlStatement("DELETE FROM vault WHERE id = ?", [id("vault", 5)]));
          for (const table of ["job", "contact"]) {
            const ownerId = table === "job" ? jobId : contactId;
            await database.execute(
              sqlStatement(`UPDATE ${table} SET archived_at = ? WHERE id = ?`, [at, ownerId]),
            );
            await rejectsUnchanged(() => port.recordInteraction(input));
            await database.execute(
              sqlStatement(`UPDATE ${table} SET archived_at = NULL WHERE id = ?`, [ownerId]),
            );
          }
          const stored = await port.recordInteraction(input);
          assert(
            stored.id === input.id &&
              stored.summary === input.summary &&
              stored.contactId === contactId &&
              stored.rowVersion === 1,
            "Exact interaction acknowledgement changed.",
          );
          await rejectsUnchanged(() => port.recordInteraction({ ...input, summary: "collision" }));
          await database.execute(
            sqlStatement("UPDATE job SET row_version = 2, archived_at = ? WHERE id = ?", [
              at,
              jobId,
            ]),
          );
          const beforeRetry = await snapshot(database);
          const replay = await port.recordInteraction(input);
          assert(
            JSON.stringify(replay) === JSON.stringify(stored),
            "Exact retry changed acknowledgement.",
          );
          assert(
            (await snapshot(database)) === beforeRetry,
            "Exact retry performed a canonical write.",
          );
          await rejectsUnchanged(() =>
            port.recordInteraction({ ...input, id: id("interaction", 6) }),
          );
          await database.execute(
            sqlStatement("UPDATE job SET archived_at = NULL WHERE id = ?", [jobId]),
          );
          const withoutContact = await port.recordInteraction({
            ...input,
            id: id("interaction", 7),
            contactId: null,
            expected: { ...input.expected, jobRowVersion: 2, contactRowVersion: null },
          });
          assert(withoutContact.contactId === null, "Job-only recording invented a contact.");
          const rows = await database.query(sqlStatement("SELECT id FROM interaction ORDER BY id"));
          assert(rows.length === 2, "Interaction retry duplicated or lost a record.");
        },
      },
    ],
  );
