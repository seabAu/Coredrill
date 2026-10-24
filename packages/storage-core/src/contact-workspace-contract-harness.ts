import {
  createContactWorkspaceOperations,
  resolveContactManualFieldsV1,
  type CreateViewedContactPortInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { defineDatabaseContractSuite, DatabaseContractViolation } from "./contract-harness.js";
import { createContactWorkspaceRepository } from "./contact-workspace-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import { createPortableDataExportV1 } from "./portable-data-export.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";
import { CompanyRepository, ContactRepository } from "./tracker-repositories.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const id = <Entity extends string>(type: Entity, suffix: number) =>
  entityId(type, `0198e104-0000-7000-8000-${String(suffix).padStart(12, "0")}`);
const vaultId = id("vault", 1);
const contactId = id("contact", 2);
const companyId = id("company", 3);
const otherVaultId = id("vault", 6);
const legacyId = id("contact", 5);
const at = instant("2026-10-21T12:00:00.000Z");
const later = instant("2026-10-21T13:00:00.000Z");
const context = (suffix = 4, initiatedAt = at) => ({
  operationId: id("application-operation", suffix),
  initiatedAt,
});
const scope = { specVersion: 1 as const, expectedVaultId: vaultId };
const read = { ...scope, contactId };
const fields = {
  origin: "user_entered" as const,
  name: "  Synthetic <contact> & literal  ",
  role: " Engineer ",
  email: "Synthetic@synthetic.example",
  phone: null,
  publicProfileUrl: null,
  notes: "  Synthetic note\n<b>inert</b> 🧭  ",
};
const hashValue = async (value: string): Promise<string> => {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const operations = (database: DatabasePort) =>
  createContactWorkspaceOperations(
    createContactWorkspaceRepository(database, hashValue),
    hashValue,
  );
const creation = () => ({ ...scope, contactId, contact: fields });
const snapshot = async (database: DatabasePort): Promise<string> =>
  JSON.stringify({
    roots: await database.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
    companies: await database.query(sqlStatement("SELECT * FROM company ORDER BY id")),
    contacts: await database.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
    receipts: await database.query(
      sqlStatement("SELECT * FROM contact_manual_creation ORDER BY contact_id"),
    ),
    provenance: await database.query(
      sqlStatement("SELECT * FROM contact_point_provenance ORDER BY id"),
    ),
  });
const addRoot = async (database: DatabasePort, rootId = vaultId) =>
  database.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      [rootId, "Synthetic contact workspace", (await database.diagnostics()).schemaVersion, at, at],
    ),
  );
const rejected = async (work: () => Promise<unknown>, message: string): Promise<void> => {
  let failed = false;
  try {
    await work();
  } catch {
    failed = true;
  }
  assert(failed, message);
};
const faultDatabase = (
  database: DatabasePort,
  stage: "receipt" | "readback" | "root" | "notes",
) => {
  let reached = false;
  let inserted = false;
  const observed: DatabasePort = {
    query: database.query.bind(database),
    execute: database.execute.bind(database),
    diagnostics: database.diagnostics.bind(database),
    exportPortable: database.exportPortable.bind(database),
    transaction: (work) =>
      database.transaction((session) =>
        work({
          query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
            if (
              stage === "readback" &&
              inserted &&
              statement.sql.includes("FROM contact WHERE id")
            ) {
              reached = true;
              throw new Error("Synthetic contact acknowledgement failure");
            }
            return session.query<Row>(statement);
          },
          execute: async (statement) => {
            const result = await session.execute(statement);
            if (statement.sql.includes("INSERT INTO contact_manual_creation(")) {
              inserted = true;
              if (stage === "receipt") {
                reached = true;
                throw new Error("Synthetic post-receipt failure");
              }
              if (stage === "root") {
                reached = true;
                await session.execute(
                  sqlStatement("UPDATE vault SET id = ? WHERE id = ?", [otherVaultId, vaultId]),
                );
              }
            }
            if (stage === "notes" && statement.sql.includes("UPDATE contact SET notes")) {
              reached = true;
              await session.execute(
                sqlStatement("UPDATE contact SET email = ? WHERE id = ?", [
                  "changed@synthetic.example",
                  contactId,
                ]),
              );
            }
            return result;
          },
        }),
      ),
  };
  return { database: observed, reached: () => reached };
};

export const createContactWorkspaceContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactWorkspace.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactWorkspace.cases.manualCreation,
        run: async (database) => {
          await setup.migrate(database, 160);
          await addRoot(database);
          await new ContactRepository(database).create({
            ...fields,
            id: legacyId,
            companyId: null,
            confidence: null,
            userConfirmed: true,
            archivedAt: null,
            createdAt: at,
            updatedAt: at,
          });
          const legacyBefore = JSON.stringify(
            await database.query(sqlStatement("SELECT * FROM contact")),
          );
          const legacyLedger = await database.query(
            sqlStatement(
              "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
            ),
          );
          const oldExport = await createPortableDataExportV1({
            database,
            vaultId,
            generatedAt: at,
          });
          assert(
            oldExport.sourceSchemaVersion === 160 &&
              oldExport.datasetCount === 57 &&
              !oldExport.datasets.some((item) => item.dataset === "contact_manual_creation"),
            "Schema160 export was not preserved.",
          );
          await setup.migrate(database);
          const currentLedger = await database.query(
            sqlStatement(
              "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
            ),
          );
          assert(
            currentLedger.length === 167 &&
              JSON.stringify(currentLedger.slice(0, 160)) === JSON.stringify(legacyLedger),
            "Contact migrations changed reviewed prior migration identities/checksums.",
          );
          assert(
            JSON.stringify(await database.query(sqlStatement("SELECT * FROM contact"))) ===
              legacyBefore,
            "Migration changed legacy contacts.",
          );
          assert(
            (await database.query(sqlStatement("SELECT * FROM contact_manual_creation"))).length ===
              0,
            "Migration invented manual basis.",
          );
          const local = operations(database);
          const legacy = await local.read.execute({ ...read, contactId: legacyId }, context());
          assert(
            legacy.ok &&
              legacy.value.manualCreation === null &&
              (await resolveContactManualFieldsV1(legacy.value, hashValue)).length === 0,
            "Legacy confirmation flags became manual evidence.",
          );
          const initial = await snapshot(database);
          const legacyNameHash = await hashValue(fields.name);
          const legacyRoleHash = await hashValue(fields.role);
          const legacyEmailHash = await hashValue(fields.email);
          for (const parameters of [
            [
              legacyId,
              id("application-operation", 64),
              at,
              legacyNameHash,
              null,
              legacyEmailHash,
              null,
              null,
            ],
            [
              legacyId,
              id("application-operation", 64),
              later,
              legacyNameHash,
              legacyRoleHash,
              legacyEmailHash,
              null,
              null,
            ],
            [
              legacyId,
              "0198e104-0000-7000-8000-000000000-64",
              at,
              legacyNameHash,
              legacyRoleHash,
              legacyEmailHash,
              null,
              null,
            ],
          ])
            await rejected(
              () =>
                database.execute(
                  sqlStatement(
                    "INSERT INTO contact_manual_creation VALUES(?,?,?,?,?,?,?,?)",
                    parameters,
                  ),
                ),
              "Invalid raw initial evidence bypassed nullable/audit/UUID guards.",
            );
          assert(
            (await snapshot(database)) === initial,
            "Rejected raw evidence changed legacy facts or basis.",
          );
          assert(
            !(
              await local.create.execute(
                { ...creation(), expectedVaultId: otherVaultId },
                context(),
              )
            ).ok,
            "Creation rebound a foreign vault.",
          );
          assert(
            !(await local.read.execute(read, context())).ok,
            "Missing contact became an invented record.",
          );
          assert(
            (await snapshot(database)) === initial,
            "Read/rejected foreign context changed canonical rows.",
          );
          for (const stage of ["receipt", "readback", "root"] as const) {
            const faulty = faultDatabase(database, stage);
            assert(
              !(await operations(faulty.database).create.execute(creation(), context())).ok &&
                faulty.reached(),
              "Creation fault did not reach the real write/acknowledgement stage.",
            );
            assert(
              (await snapshot(database)) === initial,
              "Contact/receipt/root escaped creation rollback.",
            );
          }
          await new CompanyRepository(database).create({
            id: companyId,
            canonicalName: "Synthetic linked company",
            websiteUrl: null,
            domain: null,
            locationId: null,
            notes: "",
            archivedAt: null,
            createdAt: at,
            updatedAt: at,
          });
          for (const [suffix, archivedAt, createdAt] of [
            [71, at, at],
            [72, null, later],
          ] as const)
            await new CompanyRepository(database).create({
              id: id("company", suffix),
              canonicalName: "Synthetic guarded company",
              websiteUrl: null,
              domain: null,
              locationId: null,
              notes: "",
              archivedAt,
              createdAt,
              updatedAt: createdAt,
            });
          const linked = {
            ...creation(),
            contact: { ...fields, companyId },
            expectedCompanyRowVersion: 1,
          };
          const before = await snapshot(database);
          for (const suffix of [71, 72])
            assert(
              !(
                await local.create.execute(
                  { ...linked, contact: { ...fields, companyId: id("company", suffix) } },
                  context(),
                )
              ).ok,
              "Creation accepted an archived company or an audit instant before its parent existed.",
            );
          assert(
            !(await local.create.execute({ ...linked, expectedCompanyRowVersion: 2 }, context()))
              .ok,
            "Creation accepted a stale selected company.",
          );
          assert(
            !(
              await local.create.execute(
                { ...linked, contact: { ...fields, companyId: id("company", 99) } },
                context(),
              )
            ).ok,
            "Creation invented a missing company.",
          );
          assert((await snapshot(database)) === before, "Rejected company scope changed records.");
          let captured: CreateViewedContactPortInputV1 | undefined;
          const port = createContactWorkspaceRepository(database, hashValue);
          const capturing = createContactWorkspaceOperations(
            {
              ...port,
              create: async (input) => {
                captured = input;
                return port.create(input);
              },
            },
            hashValue,
          );
          const created = await capturing.create.execute(linked, context());
          assert(
            created.ok &&
              created.value.contact.companyId === companyId &&
              created.value.contact.email === fields.email &&
              created.value.contact.phone === null &&
              created.value.contact.notes === fields.notes,
            "Manual contact facts were changed or guessed.",
          );
          assert(
            (await resolveContactManualFieldsV1(created.value, hashValue)).join(",") ===
              "name,role,email",
            "Manual basis was not bound to exact values.",
          );
          const acknowledged = await snapshot(database);
          await rejected(
            () =>
              database.execute(
                sqlStatement(
                  `INSERT OR REPLACE INTO contact_manual_creation(contact_id,operation_id,created_at,
               name_hash,role_hash,email_hash,phone_hash,public_profile_url_hash)
             SELECT ?,operation_id,created_at,name_hash,role_hash,email_hash,phone_hash,public_profile_url_hash
             FROM contact_manual_creation WHERE contact_id = ?`,
                  [legacyId, contactId],
                ),
              ),
            "Alternate operation identity detached existing manual evidence.",
          );
          await rejected(
            () => database.query(sqlStatement("SELECT rowid FROM contact_manual_creation LIMIT 1")),
            "Manual creation evidence retained a hidden replaceable identity.",
          );
          assert(
            (await snapshot(database)) === acknowledged,
            "Rejected alternate-key replacement changed contact evidence.",
          );
          assert(
            !(await local.read.execute({ ...read, expectedVaultId: otherVaultId }, context())).ok,
            "Selected detail rebound a foreign vault.",
          );
          assert(
            !(await local.create.execute(linked, context())).ok,
            "Creation retry duplicated the original identity.",
          );
          assert(captured !== undefined, "Creation port input was not observed.");
          const original = captured;
          await rejected(
            () =>
              port.create({ ...original, contact: { ...original.contact, id: id("contact", 7) } }),
            "Original intent was reused for another contact.",
          );
          await rejected(
            () =>
              port.create({
                ...original,
                contact: { ...original.contact, id: id("contact", 7) },
                manualCreation: {
                  ...original.manualCreation,
                  operationId: id("application-operation", 8),
                  valueHashes: { ...original.manualCreation.valueHashes, email: "f".repeat(64) },
                },
              }),
            "Storage trusted a caller-supplied mismatched digest.",
          );
          assert(
            (await snapshot(database)) === acknowledged,
            "Rejected identity/hash check changed records.",
          );
          const readOnly: DatabasePort = {
            ...database,
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
                      new DatabaseContractViolation("Selected-contact read attempted a write."),
                    ),
                }),
              ),
          };
          const selected = await operations(readOnly).read.execute(read, context());
          assert(
            selected.ok && JSON.stringify(selected.value) === JSON.stringify(created.value),
            "Selected read changed exact facts or manual evidence.",
          );
          assert(
            (await snapshot(database)) === acknowledged,
            "Selected read changed canonical rows.",
          );
          const exported = await createPortableDataExportV1({
            database,
            vaultId,
            generatedAt: later,
          });
          const evidence = exported.datasets.find(
            (item) => item.dataset === "contact_manual_creation",
          );
          assert(
            exported.sourceSchemaVersion === 167 &&
              exported.datasetCount === 58 &&
              exported.dataFiles.length === 116 &&
              evidence?.rowCount === 1,
            "Current export omitted or miscounted contact evidence.",
          );
          const exportedRow = evidence.rows[0];
          assert(exportedRow !== undefined, "Contact evidence row is missing from export.");
          assert(
            exportedRow["contact_id"] === contactId &&
              exportedRow["email_hash"] === captured.manualCreation.valueHashes.email &&
              !evidence.columns.includes("email"),
            "Export lost exact evidence or duplicated private scalar data.",
          );
          for (const format of ["json", "csv"] as const)
            assert(
              exported.dataFiles.some(
                (file) => file.logicalName === "contact_manual_creation" && file.format === format,
              ),
              "A paired evidence export format is missing.",
            );
          const portable = await database.exportPortable();
          assert(
            portable.schemaVersion === 167 && portable.byteLength > 0,
            "SQLite backup omitted the current schema.",
          );
          await database.execute(
            sqlStatement("UPDATE vault SET id = ? WHERE id = ?", [otherVaultId, vaultId]),
          );
          const replaced = await snapshot(database);
          assert(
            !(await local.read.execute(read, context())).ok &&
              (await snapshot(database)) === replaced,
            "Selected contact survived a replaced root or wrote during rejection.",
          );
          await database.execute(
            sqlStatement("UPDATE vault SET id = ? WHERE id = ?", [vaultId, otherVaultId]),
          );
          await addRoot(database, otherVaultId);
          const ambiguous = await snapshot(database);
          assert(
            !(await local.read.execute(read, context())).ok,
            "Ambiguous roots became a selected record.",
          );
          assert((await snapshot(database)) === ambiguous, "Ambiguous root rejection wrote data.");
        },
      },
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactWorkspace.cases.guardedNotes,
        run: async (database) => {
          await setup.migrate(database);
          const noRoot = await snapshot(database);
          assert(
            !(await operations(database).read.execute(read, context())).ok,
            "Missing root became an empty selected-contact result.",
          );
          assert(
            !(await operations(database).create.execute(creation(), context())).ok,
            "Contact creation invented a vault root.",
          );
          assert((await snapshot(database)) === noRoot, "Missing-root creation wrote data.");
          await addRoot(database);
          const local = operations(database);
          const created = await local.create.execute(creation(), context());
          assert(created.ok, "Manual contact creation failed.");
          const before = await snapshot(database);
          const update = {
            ...read,
            expectedRowVersion: 1,
            notes: "  Literal replacement\n🧭 <script>inert</script>  ",
          };
          const faulty = faultDatabase(database, "notes");
          assert(
            !(await operations(faulty.database).updateNotes.execute(update, context(10, later)))
              .ok && faulty.reached(),
            "Notes fault did not exercise the actual write.",
          );
          assert(
            (await snapshot(database)) === before,
            "Unrelated method mutation escaped notes rollback.",
          );
          for (const statement of [
            sqlStatement("UPDATE contact_manual_creation SET email_hash = ? WHERE contact_id = ?", [
              "f".repeat(64),
              contactId,
            ]),
            sqlStatement("DELETE FROM contact_manual_creation WHERE contact_id = ?", [contactId]),
            sqlStatement(
              "INSERT OR REPLACE INTO contact_manual_creation SELECT * FROM contact_manual_creation WHERE contact_id = ?",
              [contactId],
            ),
          ])
            await rejected(
              () => database.execute(statement),
              "Immutable contact evidence could be changed or detached.",
            );
          assert(
            (await snapshot(database)) === before,
            "Rejected immutable evidence write changed data.",
          );
          const updated = await local.updateNotes.execute(update, context(11, later));
          assert(
            updated.ok &&
              updated.value.contact.notes === update.notes &&
              updated.value.contact.rowVersion === 2 &&
              updated.value.contact.updatedAt === later &&
              JSON.stringify(updated.value.manualCreation) ===
                JSON.stringify(created.value.manualCreation),
            "Notes update changed evidence or exact audit facts.",
          );
          const after = await snapshot(database);
          assert(
            !(await local.updateNotes.execute(update, context(12, later))).ok,
            "Stale notes replay succeeded.",
          );
          assert(
            !(
              await local.updateNotes.execute({ ...update, expectedRowVersion: 2 }, context(13, at))
            ).ok,
            "Backwards notes audit succeeded.",
          );
          assert(
            !(
              await local.updateNotes.execute(
                { ...update, expectedVaultId: otherVaultId, expectedRowVersion: 2 },
                context(14, later),
              )
            ).ok,
            "Notes rebound a foreign vault.",
          );
          assert((await snapshot(database)) === after, "Rejected notes changed canonical data.");
          await database.execute(
            sqlStatement(
              "UPDATE contact SET email = ?, row_version = row_version + 1 WHERE id = ?",
              ["changed@synthetic.example", contactId],
            ),
          );
          const changed = await local.read.execute(read, context());
          assert(
            changed.ok &&
              (await resolveContactManualFieldsV1(changed.value, hashValue)).join(",") ===
                "name,role",
            "Changed method inherited initial manual evidence.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact SET archived_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?",
              [later, later, contactId],
            ),
          );
          const archived = await snapshot(database);
          assert(
            !(await local.read.execute(read, context())).ok &&
              (await local.read.execute({ ...read, includeArchived: true }, context())).ok,
            "Archived visibility was not explicit.",
          );
          assert(
            !(
              await local.updateNotes.execute(
                { ...update, expectedRowVersion: 4 },
                context(15, later),
              )
            ).ok,
            "Archived notes edit succeeded.",
          );
          assert(
            (await snapshot(database)) === archived,
            "Rejected archived context changed data.",
          );
          await database.execute(sqlStatement("DELETE FROM contact WHERE id = ?", [contactId]));
          assert(
            (await database.query(sqlStatement("SELECT * FROM contact_manual_creation"))).length ===
              0 && !(await local.read.execute({ ...read, includeArchived: true }, context())).ok,
            "Whole-contact deletion retained detached creation evidence.",
          );
        },
      },
    ],
  );
