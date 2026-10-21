import {
  createContactDirectoryQuery,
  type ListContactDirectoryInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createContactDirectoryRepository } from "./contact-directory-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}

export const createContactDirectoryContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactDirectory.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactDirectory.cases
          .readScopedPages,
        run: async (database) => {
          await setup.migrate(database);
          const vaultId = entityId("vault", "0198e103-0000-7000-8000-000000000001");
          const foreignVault = entityId("vault", "0198e103-0000-7000-8000-000000000002");
          const companyA = entityId("company", "0198e103-0000-7000-8000-000000000003");
          const companyB = entityId("company", "0198e103-0000-7000-8000-000000000004");
          const absentCompany = entityId("company", "0198e103-0000-7000-8000-000000000005");
          const at = instant("2026-10-21T12:00:00.000Z");
          const later = instant("2027-02-01T12:00:00.000Z");
          const future = instant("2027-01-01T12:00:00.000Z");
          const context = {
            operationId: entityId("application-operation", "0198e103-0000-7000-8000-000000000006"),
            initiatedAt: at,
          };
          const statements: SqlStatement[] = [];
          const forbidWrite = (): Promise<never> =>
            Promise.reject(
              new DatabaseContractViolation("A contact directory read attempted a write."),
            );
          const observed: DatabasePort = {
            query: database.query.bind(database),
            execute: forbidWrite,
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({
                  query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
                    statements.push(statement);
                    return session.query<Row>(statement);
                  },
                  execute: forbidWrite,
                }),
              ),
          };
          const port = createContactDirectoryRepository(observed);
          const query = createContactDirectoryQuery(port);
          const request = { specVersion: 1 as const, expectedVaultId: vaultId, limit: 2 };
          const read = async (input: ListContactDirectoryInputV1 = request) => {
            const result = await query.execute(input, context);
            assertContract(result.ok, "A valid contact directory was rejected.");
            return result.value;
          };
          const snapshot = async () =>
            JSON.stringify({
              vaults: await database.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
              companies: await database.query(sqlStatement("SELECT * FROM company ORDER BY id")),
              contacts: await database.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
              provenance: await database.query(
                sqlStatement("SELECT * FROM contact_point_provenance ORDER BY id"),
              ),
              interactions: await database.query(
                sqlStatement("SELECT * FROM interaction ORDER BY id"),
              ),
            });
          const missing = await query.execute(request, context);
          assertContract(
            !missing.ok && missing.error.code === "not_found",
            "A missing vault was mislabeled empty.",
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                vaultId,
                "Synthetic contact-directory vault",
                (await database.diagnostics()).schemaVersion,
                at,
                at,
              ],
            ),
          );
          assertContract(
            (await read()).items.length === 0,
            "An empty directory invented contacts.",
          );
          for (const id of [companyA, companyB])
            await database.execute(
              sqlStatement(
                "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
                [id, "Synthetic company", "Synthetic private company notes", at, at],
              ),
            );
          const id = (suffix: string) =>
            entityId("contact", `0198e103-0000-7000-8000-${suffix.padStart(12, "0")}`);
          for (const fixture of [
            {
              id: id("12"),
              companyId: companyB,
              role: "Other company role",
              name: "Third tied identity",
              createdAt: at,
              archivedAt: null,
            },
            {
              id: id("13"),
              companyId: null,
              role: null,
              name: "Unlinked older identity",
              createdAt: instant("2026-01-01T12:00:00.000Z"),
              archivedAt: null,
            },
            {
              id: id("10"),
              companyId: companyA,
              role: "  Literal <role>  ",
              name: "  Synthetic <person> & exact identity  ",
              createdAt: at,
              archivedAt: null,
            },
            {
              id: id("14"),
              companyId: companyA,
              role: null,
              name: "Archived identity",
              createdAt: at,
              archivedAt: later,
            },
            {
              id: id("15"),
              companyId: companyA,
              role: "r".repeat(512),
              name: "n".repeat(512),
              createdAt: future,
              archivedAt: null,
            },
            {
              id: id("11"),
              companyId: companyA,
              role: null,
              name: "Second tied identity",
              createdAt: at,
              archivedAt: null,
            },
          ])
            await database.execute(
              sqlStatement(
                "INSERT INTO contact(id,company_id,name,role,email,phone,public_profile_url,confidence,user_confirmed,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                  fixture.id,
                  fixture.companyId,
                  fixture.name,
                  fixture.role,
                  "synthetic-private@example.invalid",
                  "Synthetic private phone",
                  "http://example.invalid/private-profile",
                  0.5,
                  0,
                  "Synthetic private contact notes",
                  fixture.archivedAt,
                  fixture.createdAt,
                  fixture.archivedAt ?? fixture.createdAt,
                ],
              ),
            );
          const before = await snapshot();
          const first = await read();
          assertContract(
            first.items[0]?.id === id("15") &&
              first.items[0].name.length === 512 &&
              first.items[0].role?.length === 512,
            "A future or maximum-length identity was hidden or changed.",
          );
          assertContract(
            first.items[1]?.name === "  Synthetic <person> & exact identity  " &&
              first.items[1].role === "  Literal <role>  ",
            "Literal contact identity changed.",
          );
          assertContract(
            first.nextCursor !== null && first.hasMore,
            "Exact continuation was missing.",
          );
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(second.nextCursor !== null, "Tied continuation was missing.");
          const third = await read({ ...request, after: second.nextCursor });
          assertContract(
            JSON.stringify(
              [...first.items, ...second.items, ...third.items].map((item) => item.id),
            ) === JSON.stringify([id("15"), id("10"), id("11"), id("12"), id("13")]),
            "Contact pages skipped, duplicated or reordered identities.",
          );
          assertContract(
            !third.hasMore &&
              third.nextCursor === null &&
              third.items[0]?.companyId === null &&
              third.items[0].role === null,
            "Exhaustion or nullable contact facts were fabricated.",
          );
          const archived = await read({ ...request, includeArchived: true, limit: 100 });
          assertContract(
            archived.items.length === 6 &&
              archived.items.find((item) => item.id === id("14"))?.archivedAt === later,
            "Archive scope lost an actual contact.",
          );
          const filtered = await read({ ...request, companyId: companyA, limit: 100 });
          assertContract(
            JSON.stringify(filtered.items.map((item) => item.id)) ===
              JSON.stringify([id("15"), id("10"), id("11")]),
            "Selected-company scope leaked unrelated or archived contacts.",
          );
          assertContract(
            (await read({ ...request, companyId: companyA, includeArchived: true, limit: 100 }))
              .items.length === 4,
            "Company/archive scope did not compose.",
          );
          assertContract(
            (await read({ ...request, companyId: companyB })).items.length === 1,
            "Another company scope was replaced by the loaded page.",
          );
          const missingCompany = await query.execute(
            { ...request, companyId: absentCompany },
            context,
          );
          assertContract(
            !missingCompany.ok && missingCompany.error.code === "not_found",
            "A missing selected company was mislabeled empty.",
          );
          const foreign = await query.execute(
            { ...request, expectedVaultId: foreignVault },
            context,
          );
          assertContract(
            !foreign.ok && foreign.error.code === "not_found",
            "Foreign vault received contacts.",
          );
          for (const altered of [
            { ...request, includeArchived: true, after: first.nextCursor },
            { ...request, companyId: companyA, after: first.nextCursor },
          ]) {
            const wrongScope = await query.execute(altered, context);
            assertContract(
              !wrongScope.ok && wrongScope.error.code === "validation",
              "A cursor was rebound to a different filter.",
            );
          }
          assertContract((await snapshot()) === before, "Directory reads changed canonical data.");
          const serialized = JSON.stringify(archived);
          assertContract(
            !serialized.includes("private") &&
              archived.items.every((item) => Object.keys(item).length === 8),
            "A directory exposed private fields or inferred basis.",
          );
          const projections = statements.filter((statement) =>
            statement.sql.includes("FROM contact c"),
          );
          assertContract(
            projections.length > 0 &&
              projections.every(
                (statement) =>
                  !/(?:\*|notes|email|phone|public_profile_url|confidence|user_confirmed|provenance|interaction)/u.test(
                    statement.sql,
                  ) &&
                  statement.sql.includes("LIMIT ?") &&
                  statement.parameters.at(-1) !== undefined,
              ),
            "A contact projection preloaded private details or lost its bound limit.",
          );

          await database.execute(
            sqlStatement(
              "UPDATE contact SET role = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              ["Explicit fixture change", later, first.nextCursor.id],
            ),
          );
          let changed = await snapshot();
          let stale = await query.execute({ ...request, after: first.nextCursor }, context);
          assertContract(
            !stale.ok && stale.error.code === "conflict",
            "An edited cursor anchor was silently rebound.",
          );
          assertContract((await snapshot()) === changed, "Stale rejection changed records.");
          const companyPage = await read({ ...request, companyId: companyA, limit: 1 });
          assertContract(
            companyPage.nextCursor !== null,
            "Filtered page did not expose continuation.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact SET company_id = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              [companyB, later, companyPage.nextCursor.id],
            ),
          );
          stale = await query.execute(
            { ...request, companyId: companyA, limit: 1, after: companyPage.nextCursor },
            context,
          );
          assertContract(
            !stale.ok && stale.error.code === "conflict",
            "A relinked anchor silently changed company scope.",
          );
          const currentCompany = await read({ ...request, companyId: companyA, limit: 1 });
          assertContract(currentCompany.nextCursor !== null, "Filtered refresh did not recover.");
          await database.execute(
            sqlStatement("DELETE FROM contact WHERE id = ?", [currentCompany.nextCursor.id]),
          );
          stale = await query.execute(
            { ...request, companyId: companyA, limit: 1, after: currentCompany.nextCursor },
            context,
          );
          assertContract(
            !stale.ok && stale.error.code === "conflict",
            "A deleted anchor was accepted.",
          );
          const current = await read({ ...request, limit: 1 });
          assertContract(current.nextCursor !== null, "Refresh did not expose a current anchor.");
          await database.execute(
            sqlStatement(
              "UPDATE contact SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              [later, later, current.nextCursor.id],
            ),
          );
          changed = await snapshot();
          stale = await query.execute({ ...request, limit: 1, after: current.nextCursor }, context);
          assertContract(
            !stale.ok && stale.error.code === "conflict" && (await snapshot()) === changed,
            "An archived anchor was accepted or rejection wrote data.",
          );

          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                foreignVault,
                "Synthetic ambiguous root",
                (await database.diagnostics()).schemaVersion,
                at,
                at,
              ],
            ),
          );
          changed = await snapshot();
          const ambiguous = await query.execute(request, context);
          assertContract(
            !ambiguous.ok && ambiguous.error.code === "internal" && (await snapshot()) === changed,
            "Ambiguous roots exposed contacts or wrote records.",
          );
          await database.execute(sqlStatement("DELETE FROM vault WHERE id = ?", [vaultId]));
          const replaced = await query.execute(request, context);
          assertContract(
            !replaced.ok && replaced.error.code === "not_found",
            "A replaced root was silently rebound.",
          );
          const callsBefore = statements.length;
          let invalidRejected = false;
          try {
            await port.listPage({
              specVersion: 1,
              expectedVaultId: vaultId,
              includeArchived: false,
              companyId: null,
              limit: 101,
              after: null,
            });
          } catch {
            invalidRejected = true;
          }
          assertContract(
            invalidRejected && statements.length === callsBefore,
            "Invalid direct-port input reached SQL.",
          );
        },
      },
    ],
  );
