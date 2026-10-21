import {
  createCompanyDirectoryQuery,
  type ListCompanyDirectoryInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createCompanyDirectoryRepository } from "./company-directory-repository.js";
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

export const createCompanyDirectoryContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyDirectory.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.companyDirectory.cases
          .readScopedPages,
        run: async (database) => {
          await setup.migrate(database);
          const vaultId = entityId("vault", "0198e102-0000-7000-8000-000000000001");
          const otherVaultId = entityId("vault", "0198e102-0000-7000-8000-000000000002");
          const at = instant("2026-10-21T12:00:00.000Z");
          const updated = instant("2026-10-21T13:00:00.000Z");
          const future = instant("2027-01-01T00:00:00.000Z");
          const context = {
            operationId: entityId("application-operation", "0198e102-0000-7000-8000-000000000003"),
            initiatedAt: at,
          };
          const statements: SqlStatement[] = [];
          const forbidWrite = (): Promise<never> =>
            Promise.reject(
              new DatabaseContractViolation("A company directory query attempted a write."),
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
          const query = createCompanyDirectoryQuery(createCompanyDirectoryRepository(observed));
          const request = { specVersion: 1 as const, expectedVaultId: vaultId, limit: 2 };
          const read = async (input: ListCompanyDirectoryInputV1 = request) => {
            const result = await query.execute(input, context);
            assertContract(result.ok, "A valid company-directory page was rejected.");
            return result.value;
          };
          const snapshot = async () =>
            JSON.stringify({
              vaults: await database.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
              companies: await database.query(sqlStatement("SELECT * FROM company ORDER BY id")),
            });
          const absent = await query.execute(request, context);
          assertContract(
            !absent.ok && absent.error.code === "not_found",
            "An empty database invented a viewed vault.",
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                vaultId,
                "Synthetic directory vault",
                (await database.diagnostics()).schemaVersion,
                at,
                at,
              ],
            ),
          );
          assertContract(
            (await read()).items.length === 0,
            "A genuinely empty directory invented companies.",
          );
          const id = (suffix: string) =>
            entityId("company", `0198e102-0000-7000-8000-${suffix.padStart(12, "0")}`);
          for (const fixture of [
            { id: id("12"), createdAt: at, archivedAt: null, name: "Third tied company" },
            {
              id: id("13"),
              createdAt: instant("2026-01-01T00:00:00.000Z"),
              archivedAt: null,
              name: "Older company",
            },
            {
              id: id("10"),
              createdAt: at,
              archivedAt: null,
              name: "  Synthetic <company> & literal name  ",
            },
            { id: id("14"), createdAt: at, archivedAt: updated, name: "Archived company" },
            { id: id("15"), createdAt: future, archivedAt: null, name: "x".repeat(512) },
            { id: id("11"), createdAt: at, archivedAt: null, name: "Second tied company" },
          ])
            await database.execute(
              sqlStatement(
                "INSERT INTO company(id,canonical_name,website_url,domain,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                [
                  fixture.id,
                  fixture.name,
                  "http://synthetic.example/",
                  "synthetic.example",
                  "Synthetic private note sentinel",
                  fixture.archivedAt,
                  fixture.createdAt,
                  fixture.archivedAt ?? fixture.createdAt,
                ],
              ),
            );
          const before = await snapshot();
          const first = await read();
          assertContract(
            first.items[0]?.id === id("15") && first.items[0].canonicalName.length === 512,
            "A wall-clock ceiling hid a valid future-dated company.",
          );
          assertContract(
            first.items[1]?.canonicalName === "  Synthetic <company> & literal name  ",
            "A directory query altered a literal company name.",
          );
          assertContract(
            first.items.every(
              (item) =>
                item.websiteUrl === "http://synthetic.example/" && !Object.hasOwn(item, "notes"),
            ),
            "A summary altered safe HTTP or exposed notes.",
          );
          assertContract(
            first.nextCursor !== null && first.hasMore,
            "A full directory page did not expose exact continuation.",
          );
          const second = await read({ ...request, after: first.nextCursor });
          assertContract(
            second.nextCursor !== null,
            "Tied-key directory continuation was missing.",
          );
          const third = await read({ ...request, after: second.nextCursor });
          const identities = [...first.items, ...second.items, ...third.items].map(
            (item) => item.id,
          );
          assertContract(
            JSON.stringify(identities) ===
              JSON.stringify([id("15"), id("10"), id("11"), id("12"), id("13")]),
            "Live directory pages skipped, duplicated or reordered tied identities.",
          );
          assertContract(
            !third.hasMore && third.nextCursor === null,
            "An exhausted directory retained false continuation.",
          );
          const archived = await read({ ...request, includeArchived: true, limit: 100 });
          assertContract(
            archived.items.length === 6 &&
              archived.items.find((item) => item.id === id("14"))?.archivedAt === updated,
            "Explicit archive scope lost a stored company.",
          );
          const foreign = await query.execute(
            { ...request, expectedVaultId: otherVaultId },
            context,
          );
          assertContract(
            !foreign.ok && foreign.error.code === "not_found",
            "A directory returned companies from the wrong viewed vault.",
          );
          const wrongScope = await query.execute(
            { ...request, includeArchived: true, after: first.nextCursor },
            context,
          );
          assertContract(
            !wrongScope.ok && wrongScope.error.code === "validation",
            "An active cursor was rebound to archive scope.",
          );
          assertContract(
            (await snapshot()) === before,
            "Read-only company pages changed canonical local data.",
          );
          assertContract(
            !JSON.stringify(first).includes("Synthetic private note sentinel"),
            "Private notes crossed the minimized directory boundary.",
          );
          const projections = statements.filter((statement) =>
            statement.sql.includes("FROM company c"),
          );
          assertContract(
            projections.length > 0 &&
              projections.every(
                (statement) =>
                  !statement.sql.includes("notes") &&
                  !statement.sql.includes("*") &&
                  !statement.sql.includes("contact"),
              ),
            "A company summary preloaded private notes or contact details.",
          );

          await database.execute(
            sqlStatement(
              "UPDATE company SET notes = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              ["Intentional fixture edit", updated, first.nextCursor.id],
            ),
          );
          const edited = await snapshot();
          const stale = await query.execute({ ...request, after: first.nextCursor }, context);
          assertContract(
            !stale.ok && stale.error.code === "conflict",
            "An edited cursor anchor was silently rebound.",
          );
          assertContract((await snapshot()) === edited, "Cursor rejection changed canonical data.");
          const renewed = await read();
          assertContract(
            renewed.nextCursor !== null,
            "A current directory did not recover after explicit refresh.",
          );
          await database.execute(
            sqlStatement("DELETE FROM company WHERE id = ?", [renewed.nextCursor.id]),
          );
          const deleted = await query.execute({ ...request, after: renewed.nextCursor }, context);
          assertContract(
            !deleted.ok && deleted.error.code === "conflict",
            "A deleted cursor anchor was silently accepted.",
          );
          const refreshed = await read();
          assertContract(
            refreshed.nextCursor !== null,
            "A live directory did not expose its new anchor.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE company SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              [updated, updated, refreshed.nextCursor.id],
            ),
          );
          const finalBefore = await snapshot();
          const hidden = await query.execute({ ...request, after: refreshed.nextCursor }, context);
          assertContract(
            !hidden.ok && hidden.error.code === "conflict",
            "An archived active-scope anchor was silently accepted.",
          );
          assertContract(
            (await snapshot()) === finalBefore,
            "An archived-anchor rejection changed local data.",
          );
        },
      },
    ],
  );
