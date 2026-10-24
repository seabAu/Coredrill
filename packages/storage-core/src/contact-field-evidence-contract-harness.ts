import { createContactFieldEvidenceQuery } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { DatabaseContractViolation, defineDatabaseContractSuite } from "./contract-harness.js";
import { createContactFieldEvidenceRepository } from "./contact-field-evidence-repository.js";
import {
  sqlStatement,
  type DatabasePort,
  type QueryRow,
  type SqlStatement,
} from "./database-port.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new DatabaseContractViolation(message);
}
const id = (n: number) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z");
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const context = { operationId: entityId("application-operation", id(9)), initiatedAt: at };
const request = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  contactId: id(2),
  expectedContactRowVersion: 1,
  fieldName: "email" as const,
  limit: 1,
};
const value = "Synthetic@synthetic.example";
const excerpt = "\uFEFF <b>literal</b> 🧭\u0000tail";
const note = "\uFEFFUNTRUSTED public/licensed assertion";
const snapshot = async (database: DatabasePort) => {
  const result: unknown[] = [];
  for (const table of [
    "vault",
    "contact",
    "contact_manual_creation",
    "contact_point_provenance",
    "provenance",
    "source_snapshot",
    "job_source",
    "job",
  ])
    result.push(await database.query(sqlStatement(`SELECT * FROM ${table}`)));
  return JSON.stringify(result);
};
export const createContactFieldEvidenceContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactFieldEvidence.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactFieldEvidence.cases
          .readValueBoundEvidence,
        run: async (database) => {
          await setup.migrate(database);
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
              [
                id(1),
                "Synthetic evidence vault",
                (await database.diagnostics()).schemaVersion,
                at,
                at,
              ],
            ),
          );
          for (const n of [2, 3])
            await database.execute(
              sqlStatement(
                "INSERT INTO contact(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)",
                [id(n), "Synthetic identity", value, at, at],
              ),
            );
          await database.execute(
            sqlStatement("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)", [
              id(4),
              "Synthetic source job",
              at,
              at,
            ]),
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO job_source(id,job_id,canonical_url,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              [id(5), id(4), "https://synthetic.example/team", at, at, at, at],
            ),
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,created_at) VALUES(?,?,?,?,?,?,?,?)",
              [
                id(6),
                id(5),
                at,
                "synthetic-audit",
                "1",
                await hash("synthetic snapshot"),
                "synthetic-audit",
                at,
              ],
            ),
          );
          await database.execute(
            sqlStatement(
              "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,license_note,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
              [id(7), id(6), "selector", "/synthetic/email", excerpt, 0.8, at, note, at],
            ),
          );
          const digest = await hash(value);
          for (const [n, literalValue] of [
            [8, ""],
            [16, null],
          ] as const) {
            await database.execute(
              sqlStatement(
                "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,license_note,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                [
                  id(n),
                  id(6),
                  "selector",
                  "/synthetic/role",
                  literalValue,
                  0.8,
                  at,
                  literalValue,
                  at,
                ],
              ),
            );
            await database.execute(
              sqlStatement(
                "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,?,?,?,?)",
                [id(n + 20), id(2), "role", await hash("Historical role"), id(n), at],
              ),
            );
          }
          for (const [n, contact, field, digestValue] of [
            [10, 2, "email", digest],
            [11, 2, "email", await hash("Historical@synthetic.example")],
            [12, 3, "email", digest],
            [13, 2, "role", await hash("Historical role")],
          ] as const)
            await database.execute(
              sqlStatement(
                "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,?,?,?,?)",
                [id(n), id(contact), field, digestValue, id(7), at],
              ),
            );
          const before = await snapshot(database);
          const readOnly: DatabasePort = {
            query: database.query.bind(database),
            execute: () =>
              Promise.reject(new DatabaseContractViolation("Evidence read attempted a write.")),
            diagnostics: database.diagnostics.bind(database),
            exportPortable: database.exportPortable.bind(database),
            transaction: (work) =>
              database.transaction((session) =>
                work({
                  query: session.query.bind(session),
                  execute: () =>
                    Promise.reject(
                      new DatabaseContractViolation("Evidence transaction attempted a write."),
                    ),
                }),
              ),
          };
          const query = createContactFieldEvidenceQuery(
            createContactFieldEvidenceRepository(readOnly, hash),
          );
          for (const kind of ["look_ahead_chain", "final_contact", "final_vault"] as const) {
            let reached = false;
            const faultReached = () => reached;
            let contactReads = 0;
            let vaultReads = 0;
            const faulty: DatabasePort = {
              ...readOnly,
              transaction: (work) =>
                database.transaction((session) =>
                  work({
                    execute: () =>
                      Promise.reject(
                        new DatabaseContractViolation("Faulted evidence attempted a write."),
                      ),
                    query: async <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
                      const rows = await session.query<Row>(statement);
                      if (statement.sql === "SELECT id FROM vault LIMIT 2") {
                        vaultReads += 1;
                        if (kind === "final_vault" && vaultReads === 2) {
                          reached = true;
                          return rows.map((row) => ({ ...row, id: id(80) })) as Row[];
                        }
                      }
                      if (
                        statement.sql.includes("AS current_bytes") &&
                        statement.sql.includes("FROM contact WHERE")
                      ) {
                        contactReads += 1;
                        if (kind === "final_contact" && contactReads === 2) {
                          reached = true;
                          return rows.map((row) => ({ ...row, row_version: 2 })) as Row[];
                        }
                      }
                      if (
                        kind === "look_ahead_chain" &&
                        statement.sql.includes("ORDER BY l.created_at")
                      ) {
                        assert(rows.length === 2, "Fault did not reach the actual look-ahead row.");
                        reached = true;
                        return rows.map((row, index) =>
                          index === 1 ? { ...row, provenance_id: null } : row,
                        );
                      }
                      return rows;
                    },
                  }),
                ),
            };
            const result = await createContactFieldEvidenceQuery(
              createContactFieldEvidenceRepository(faulty, hash),
            ).execute(request, context);
            assert(
              faultReached() &&
                !result.ok &&
                result.error.code === (kind === "final_contact" ? "conflict" : "internal"),
              "Corrupt look-ahead or changed final owner was published.",
            );
          }
          const first = await query.execute(request, context);
          assert(
            first.ok &&
              first.value.items.length === 1 &&
              first.value.hasMore &&
              first.value.nextCursor !== null,
            "Evidence did not retain bounded continuation.",
          );
          const item = first.value.items[0];
          assert(
            item?.id === id(10) &&
              item.matchesCurrentValue &&
              item.excerpt === excerpt &&
              item.licenseNote === note &&
              item.pointer === "/synthetic/email" &&
              item.extractorVersion === "1" &&
              item.sourceUrl === "https://synthetic.example/team",
            "Literal evidence/value/source facts changed.",
          );
          assert(
            JSON.stringify(first.value.publicOrLicensedEligibility) === '"not_established"' &&
              first.value.currentValueHash === digest,
            "Provenance became public/license eligibility.",
          );
          const cursor = first.value.nextCursor;
          const second = await query.execute({ ...request, after: cursor }, context);
          assert(
            second.ok &&
              second.value.items[0]?.id === id(11) &&
              !second.value.items[0].matchesCurrentValue &&
              !second.value.hasMore,
            "Historical/tied/foreign field evidence was misclassified.",
          );
          const absent = await query.execute({ ...request, fieldName: "phone" }, context);
          assert(
            absent.ok && absent.value.currentValueHash === null && absent.value.items.length === 0,
            "Missing method/evidence was guessed.",
          );
          const historical = await query.execute({ ...request, fieldName: "role" }, context);
          assert(
            historical.ok &&
              historical.value.currentValueHash === null &&
              historical.value.items[0]?.matchesCurrentValue === false,
            "Null current value lost its historical evidence distinction.",
          );
          const foreign = await query.execute({ ...request, expectedVaultId: id(80) }, context);
          assert(
            !foreign.ok && foreign.error.code === "not_found",
            "Foreign vault exposed source facts.",
          );
          const stale = await query.execute({ ...request, expectedContactRowVersion: 2 }, context);
          assert(!stale.ok && stale.error.code === "conflict", "Stale viewed contact accepted.");
          const completeRole = await query.execute(
            { ...request, fieldName: "role", limit: 3 },
            context,
          );
          assert(
            completeRole.ok &&
              completeRole.value.items[1]?.excerpt === "" &&
              completeRole.value.items[1].licenseNote === "" &&
              completeRole.value.items[2]?.excerpt === null &&
              completeRole.value.items[2].licenseNote === null,
            "Empty and absent literal source fields were conflated.",
          );
          const mutable = { ...request };
          const copied = createContactFieldEvidenceQuery(
            createContactFieldEvidenceRepository(readOnly, async (literalValue) => {
              mutable.contactId = id(3);
              mutable.expectedVaultId = id(80);
              return hash(literalValue);
            }),
          );
          const captured = await copied.execute(mutable, context);
          assert(
            captured.ok && captured.value.contactId === id(2) && captured.value.vaultId === id(1),
            "Awaited hashing rebound contact evidence scope.",
          );
          assert(
            (await snapshot(database)) === before,
            "Selected evidence read changed canonical rows.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact_point_provenance SET row_version = row_version + 1 WHERE id = ?",
              [id(10)],
            ),
          );
          const changedAnchor = await query.execute({ ...request, after: cursor }, context);
          assert(
            !changedAnchor.ok && changedAnchor.error.code === "conflict",
            "Changed evidence anchor was silently rebased.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact SET email = ?, row_version = row_version + 1 WHERE id = ?",
              ["Changed@synthetic.example", id(2)],
            ),
          );
          const changed = await query.execute(
            { ...request, expectedContactRowVersion: 2 },
            context,
          );
          assert(
            changed.ok &&
              changed.value.items[0]?.matchesCurrentValue === false &&
              changed.value.items[0].valueHash === digest,
            "Changed method rewrote or reused historical binding.",
          );
          await database.execute(
            sqlStatement(
              "UPDATE contact SET archived_at = ?, row_version = row_version + 1 WHERE id = ?",
              [at, id(2)],
            ),
          );
          const archivedRequest = { ...request, expectedContactRowVersion: 3 };
          const hidden = await query.execute(archivedRequest, context);
          assert(
            !hidden.ok && hidden.error.code === "not_found",
            "Archived contact evidence ignored visibility scope.",
          );
          const visible = await query.execute(
            { ...archivedRequest, includeArchived: true },
            context,
          );
          assert(
            visible.ok && visible.value.items.length === 1,
            "Explicit archive evidence was discarded.",
          );
        },
      },
    ],
  );
