import { createCompanyWorkspaceOperations, type CompanyWorkspaceV1 } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { defineDatabaseContractSuite, DatabaseContractViolation } from "./contract-harness.js";
import { createCompanyWorkspaceRepository } from "./company-workspace-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const vaultId = entityId("vault", "0198e103-0000-7000-8000-000000000001");
const otherVaultId = entityId("vault", "0198e103-0000-7000-8000-000000000002");
const companyId = entityId("company", "0198e103-0000-7000-8000-000000000003");
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = {
  operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000004"),
  initiatedAt: at,
};
const scope = { specVersion: 1 as const, expectedVaultId: vaultId };
const fields = {
  origin: "user_entered" as const,
  canonicalName: "  Synthetic <company> & literal  ",
  websiteUrl: "http://synthetic.example/",
  domain: "SYNTHETIC.EXAMPLE",
  notes: "  Synthetic note\n<b>inert</b> 🧭  ",
};
const snapshot = async (database: DatabasePort) =>
  JSON.stringify({
    roots: await database.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
    companies: await database.query(sqlStatement("SELECT * FROM company ORDER BY id")),
    contacts: await database.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
    jobs: await database.query(sqlStatement("SELECT * FROM job ORDER BY id")),
  });
const initialize = async (database: DatabasePort, setup: Phase1RepositoryContractSetup) => {
  await setup.migrate(database);
  await database.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      [
        vaultId,
        "Synthetic company workspace",
        (await database.diagnostics()).schemaVersion,
        at,
        at,
      ],
    ),
  );
};
const operations = (database: DatabasePort) =>
  createCompanyWorkspaceOperations(createCompanyWorkspaceRepository(database), () => companyId);
const read = { ...scope, companyId };

export const createCompanyWorkspaceContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyWorkspace.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyWorkspace.cases.createAndRead,
        run: async (database) => {
          await setup.migrate(database);
          const local = operations(database);
          const beforeRoot = await snapshot(database);
          assert(
            !(await local.create.execute({ ...scope, company: fields }, context)).ok,
            "Company creation invented a vault.",
          );
          assert((await snapshot(database)) === beforeRoot, "Missing-root rejection wrote data.");
          await initialize(database, setup);
          const before = await snapshot(database);
          assert(
            !(await local.read.execute(read, context)).ok,
            "Missing company became an invented detail.",
          );
          assert(
            !(
              await local.create.execute(
                { ...scope, expectedVaultId: otherVaultId, company: fields },
                context,
              )
            ).ok,
            "Company creation rebound a foreign viewed vault.",
          );
          assert((await snapshot(database)) === before, "Foreign-vault creation wrote data.");
          let inserted = false;
          const failedCreation: DatabasePort = {
            query: database.query.bind(database),
            execute: database.execute.bind(database),
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({
                  query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
                    if (inserted && statement.sql.includes("FROM company WHERE id")) {
                      throw new Error("Synthetic creation readback failure");
                    }
                    return session.query<Row>(statement);
                  },
                  execute: async (statement) => {
                    const result = await session.execute(statement);
                    if (statement.sql.includes("INSERT INTO company(")) inserted = true;
                    return result;
                  },
                }),
              ),
          };
          assert(
            !(
              await operations(failedCreation).create.execute(
                { ...scope, company: fields },
                context,
              )
            ).ok && inserted,
            "Creation fault did not exercise the actual insert.",
          );
          assert(
            (await snapshot(database)) === before,
            "Company creation escaped a failed acknowledgement rollback.",
          );
          const created = await local.create.execute({ ...scope, company: fields }, context);
          assert(created.ok, "Valid manual company was not created.");
          assert(
            created.value.company.canonicalName === fields.canonicalName &&
              created.value.company.notes === fields.notes &&
              created.value.company.domain === "synthetic.example" &&
              created.value.company.websiteUrl === fields.websiteUrl &&
              created.value.company.locationId === null,
            "Manual creation changed literal or nullable facts.",
          );
          const acknowledged = await snapshot(database);
          const readOnly: DatabasePort = {
            query: database.query.bind(database),
            execute: database.execute.bind(database),
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({
                  query: session.query.bind(session),
                  execute: () =>
                    Promise.reject(
                      new DatabaseContractViolation("Selected-company reading attempted a write."),
                    ),
                }),
              ),
          };
          const selected = await operations(readOnly).read.execute(read, context);
          assert(
            selected.ok && JSON.stringify(selected.value) === JSON.stringify(created.value),
            "Canonical company detail differs from acknowledgement.",
          );
          assert(
            !(await local.create.execute({ ...scope, company: fields }, context)).ok,
            "A repeated company identity was created twice.",
          );
          assert(
            !(await local.read.execute({ ...read, expectedVaultId: otherVaultId }, context)).ok,
            "Company read crossed vault ownership.",
          );
          assert(
            (await snapshot(database)) === acknowledged,
            "Read/rejected replay altered stored data.",
          );
          assert(
            (await database.query(sqlStatement("SELECT id FROM contact"))).length === 0,
            "Company creation invented a contact.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE company SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              [later, later, companyId],
            ),
          );
          assert(
            !(await local.read.execute(read, context)).ok,
            "An active-only read exposed archived company details.",
          );
          const archived = await local.read.execute({ ...read, includeArchived: true }, context);
          assert(
            archived.ok && archived.value.company.archivedAt === later,
            "Explicit archive read lost the archive instant.",
          );
          // Legacy/imported corruption can contain multiple roots despite normal bootstrap guards.
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                otherVaultId,
                "Synthetic ambiguous root",
                (await database.diagnostics()).schemaVersion,
                at,
                at,
              ],
            ),
          );
          const ambiguous = await snapshot(database);
          assert(
            !(await local.read.execute({ ...read, includeArchived: true }, context)).ok,
            "Company detail chose an ambiguous root.",
          );
          assert(
            !(await local.create.execute({ ...scope, company: fields }, context)).ok,
            "Company create chose an ambiguous root.",
          );
          assert((await snapshot(database)) === ambiguous, "Ambiguous-root rejection wrote data.");
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyWorkspace.cases.guardedNotes,
        run: async (database) => {
          await initialize(database, setup);
          const local = operations(database);
          const created = await local.create.execute(
            {
              ...scope,
              company: { ...fields, canonicalName: "x".repeat(512), notes: "🧭".repeat(100_000) },
            },
            context,
          );
          assert(
            created.ok && created.value.company.notes.length === 200_000,
            "Existing full company/notes bounds were narrowed.",
          );
          const input = {
            ...scope,
            companyId,
            expectedRowVersion: 1,
            notes: "  Replacement\n<script>still inert</script> 🧭  ",
          };
          const before = await snapshot(database);
          for (const invalid of [
            { ...input, expectedVaultId: otherVaultId },
            { ...input, expectedRowVersion: 2 },
          ]) {
            assert(
              !(await local.updateNotes.execute(invalid, { ...context, initiatedAt: later })).ok,
              "A stale/foreign notes edit was accepted.",
            );
            assert(
              (await snapshot(database)) === before,
              "Rejected notes edit caused partial writes.",
            );
          }
          let armed = false;
          const observed: DatabasePort = {
            query: database.query.bind(database),
            execute: database.execute.bind(database),
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({
                  query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
                    if (armed && statement.sql.includes("FROM company WHERE id"))
                      throw new Error("Synthetic post-write readback failure");
                    return session.query<Row>(statement);
                  },
                  execute: async (statement) => {
                    const result = await session.execute(statement);
                    if (statement.sql.includes("UPDATE company SET notes")) armed = true;
                    return result;
                  },
                }),
              ),
          };
          assert(
            !(
              await operations(observed).updateNotes.execute(input, {
                ...context,
                initiatedAt: later,
              })
            ).ok && armed,
            "Post-write failure fixture did not exercise the write.",
          );
          assert(
            (await snapshot(database)) === before,
            "A failed company notes acknowledgement escaped rollback.",
          );
          const updated = await local.updateNotes.execute(input, {
            ...context,
            initiatedAt: later,
          });
          assert(
            updated.ok &&
              updated.value.company.notes === input.notes &&
              updated.value.company.rowVersion === 2 &&
              updated.value.company.updatedAt === later,
            "Notes save did not acknowledge its exact literal/version/time.",
          );
          const original: CompanyWorkspaceV1["company"] = created.value.company;
          for (const key of [
            "id",
            "canonicalName",
            "websiteUrl",
            "domain",
            "locationId",
            "createdAt",
            "archivedAt",
          ] as const)
            assert(
              updated.value.company[key] === original[key],
              "Notes save altered unrelated company facts.",
            );
          const saved = await snapshot(database);
          assert(
            !(await local.updateNotes.execute(input, { ...context, initiatedAt: later })).ok,
            "A replayed notes write succeeded.",
          );
          assert(
            !(await local.updateNotes.execute({ ...input, expectedRowVersion: 2 }, context)).ok,
            "A backwards audit instant succeeded.",
          );
          assert((await snapshot(database)) === saved, "Replay/backwards rejection changed data.");
          const empty = await local.updateNotes.execute(
            { ...input, expectedRowVersion: 2, notes: "" },
            { ...context, initiatedAt: later },
          );
          assert(
            empty.ok && empty.value.company.notes === "" && empty.value.company.rowVersion === 3,
            "Explicit empty notes were confused with missing notes.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE company SET archived_at = ?, row_version = row_version + 1 WHERE id = ?",
              [later, companyId],
            ),
          );
          const archived = await snapshot(database);
          assert(
            !(
              await local.updateNotes.execute(
                { ...input, expectedRowVersion: 4 },
                { ...context, initiatedAt: later },
              )
            ).ok,
            "A current-version archived company accepted notes.",
          );
          assert((await snapshot(database)) === archived, "Archived notes rejection changed data.");
          await database.execute(
            sqlStatement("UPDATE vault SET id = ? WHERE id = ?", [otherVaultId, vaultId]),
          );
          const replaced = await snapshot(database);
          assert(
            !(await local.read.execute({ ...read, includeArchived: true }, context)).ok,
            "An existing port read through a replaced vault owner.",
          );
          assert(
            !(await local.create.execute({ ...scope, company: fields }, context)).ok,
            "An existing port created through a replaced vault owner.",
          );
          assert(
            !(
              await local.updateNotes.execute(
                { ...input, expectedRowVersion: 4 },
                { ...context, initiatedAt: later },
              )
            ).ok,
            "An existing port edited through a replaced vault owner.",
          );
          assert(
            (await snapshot(database)) === replaced,
            "Retired-vault operations changed the replacement vault.",
          );
        },
      },
    ],
  );
