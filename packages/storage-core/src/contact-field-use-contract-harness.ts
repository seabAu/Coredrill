import {
  createContactFieldUseOperations,
  parseContactUseRecordRequestV1,
  parseContactDeletionResultV1,
  type ApplicationResult,
  type ContactUseRecordInputV1,
  type ContactUseRecordRequestV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { defineDatabaseContractSuite, DatabaseContractViolation } from "./contract-harness.js";
import { createContactFieldUseRepository } from "./contact-field-use-repository.js";
import { createContactDeletionRepository } from "./contact-deletion-repository.js";
import { sqlStatement, type DatabasePort, type DatabaseTransaction } from "./database-port.js";
import { createPortableDataExportV1 } from "./portable-data-export.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";
import type { Phase1RepositoryContractSetup } from "./phase-1-repository-contract-harness.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DatabaseContractViolation(message);
}
const id = (n: number) => `0198e122-0000-7000-8000-${String(n).padStart(12, "0")}`;
const captured = instant("2026-10-20T12:00:00.000Z"),
  at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z"),
  due = instant("2026-11-01T12:00:00.000Z");
const context = (n: number, time = at) => ({
  operationId: entityId("application-operation", id(n)),
  initiatedAt: time,
});
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const value = <T>(result: ApplicationResult<T>): T => {
  assert(result.ok, "A contact qualification operation did not succeed.");
  return result.value;
};
const failure = (result: ApplicationResult<unknown>, code: string) => {
  assert(
    !result.ok && result.error.code === code,
    "A contact qualification rejection did not preserve its safe code.",
  );
};
const operations = (database: DatabasePort) =>
  createContactFieldUseOperations(createContactFieldUseRepository(database, hash), hash);
const decode = (bytes: unknown) => {
  assert(bytes instanceof Uint8Array, "Literal evidence was not read as bytes.");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
};
const fixtures = async (n = 0) => {
  const sourceClass = (["official_employer_page", "public_dataset", "licensed_material"] as const)[
    n
  ];
  assert(sourceClass !== undefined, "Unknown synthetic source fixture.");
  const contactId = id(2 + n * 10),
    sourceId = id(30 + n * 10),
    policyId = id(31 + n * 10),
    reviewId = id(32 + n * 10),
    termsId = id(33 + n * 10);
  const email = `synthetic${String(n)}@synthetic.example`,
    terms = "Synthetic permission for manual job-search field use.";
  const body = `\uFEFFSynthetic employer\n${email}\n<script>inert</script>\0尾🧭`,
    termsBody = `\uFEFF${terms}\0Synthetic retained terms尾`;
  const start = new TextEncoder().encode(body.slice(0, body.indexOf(email))).length;
  const source = {
    specVersion: 1 as const,
    kind: "source" as const,
    expectedVaultId: id(1),
    sourceSnapshotId: sourceId,
    sourceClass,
    sourceUrl: "https://synthetic.example/team",
    capturedAt: captured,
    literalText: body,
  };
  const policy = {
    specVersion: 1 as const,
    kind: "policy" as const,
    expectedVaultId: id(1),
    policyId,
    sourceSnapshotId: sourceId,
    expectedSourceHash: await hash(body),
    fieldName: "email" as const,
    termsSnapshotId: termsId,
    expectedTermsHash: await hash(termsBody),
    termsStartByte: 3,
    termsEndByte: 3 + new TextEncoder().encode(terms).length,
    termsExcerpt: terms,
    permissionKind:
      (
        [
          "explicit_public_job_search_contact",
          "compatible_public_reuse",
          "documented_license_grant",
        ] as const
      )[n] ?? "explicit_public_job_search_contact",
    purpose: "job_search" as const,
    reviewDueAt: due,
    acknowledgement: "I reviewed this source's permitted field use." as const,
  };
  const review = {
    specVersion: 1 as const,
    kind: "review" as const,
    expectedVaultId: id(1),
    reviewId,
    contactId,
    expectedContactRowVersion: 1,
    expectedLatestReviewId: null,
    fieldName: "email" as const,
    expectedValueHash: await hash(email),
    sourceSnapshotId: sourceId,
    expectedSourceHash: await hash(body),
    sourceStartByte: start,
    sourceEndByte: start + new TextEncoder().encode(email).length,
    sourceExcerpt: email,
    policyId,
    policyRevision: 1 as const,
    purpose: "job_search" as const,
    purposeNote: "\uFEFFSynthetic manual review\0尾",
    reviewDueAt: due,
    expiresAt: due,
    acknowledgement: "I reviewed this exact contact field and purpose." as const,
  };
  const termsSource = { ...source, sourceSnapshotId: termsId, literalText: termsBody };
  const read = {
    specVersion: 1 as const,
    expectedVaultId: id(1),
    contactId,
    expectedContactRowVersion: 1,
    fieldName: "email" as const,
  };
  return {
    source,
    termsSource,
    policy,
    review,
    read,
    email,
    body,
    terms,
    termsBody,
    rightsBasis: sourceClass === "licensed_material" ? "licensed" : "public",
  };
};
const initialize = async (db: DatabasePort, version: number, count = 1) => {
  await db.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      [id(1), "Synthetic qualification vault", version, captured, at],
    ),
  );
  for (let n = 0; n < count; n += 1)
    await db.execute(
      sqlStatement(
        "INSERT INTO contact(id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
        [
          id(2 + n * 10),
          `Synthetic contact ${String(n)}`,
          `synthetic${String(n)}@synthetic.example`,
          "PRIVATE synthetic note sentinel",
          captured,
          captured,
        ],
      ),
    );
};
const capture = async (db: DatabasePort) =>
  JSON.stringify({
    roots: await db.query(sqlStatement("SELECT * FROM vault ORDER BY id")),
    contacts: await db.query(
      sqlStatement(
        "SELECT id,row_version,archived_at,CAST(email AS BLOB) AS email_bytes,CAST(notes AS BLOB) AS notes_bytes FROM contact ORDER BY id",
      ),
    ),
    sources: await db.query(
      sqlStatement(
        "SELECT id,operation_id,content_hash,CAST(raw_text AS BLOB) AS bytes FROM contact_source_snapshot ORDER BY id",
      ),
    ),
    policies: await db.query(
      sqlStatement(
        "SELECT id,status,disabled_at,row_version,CAST(terms_excerpt AS BLOB) AS bytes FROM contact_source_use_policy ORDER BY id",
      ),
    ),
    reviews: await db.query(
      sqlStatement(
        "SELECT id,contact_id,field_revision,revoked_at,row_version,CAST(source_excerpt AS BLOB) AS bytes,CAST(purpose_note AS BLOB) AS purpose_bytes FROM contact_field_use_review ORDER BY id",
      ),
    ),
  });
const record = async (db: DatabasePort, input: ContactUseRecordInputV1, n: number, time = at) =>
  value(await operations(db).record.execute(input, context(n, time)));
const retain = async (db: DatabasePort, f: Awaited<ReturnType<typeof fixtures>>, n: number) => {
  await record(db, f.source, n);
  await record(db, f.termsSource, n + 1);
  await record(db, f.policy, n + 2);
};
const fault = (db: DatabasePort, table: string, corrupt = false): DatabasePort => ({
  query: (statement) => db.query(statement),
  execute: (statement) => db.execute(statement),
  diagnostics: () => db.diagnostics(),
  exportPortable: () => db.exportPortable(),
  transaction: <T>(work: (session: DatabaseTransaction) => Promise<T>) =>
    db.transaction((s) => {
      let inserted = false;
      return work({
        execute: async (statement) => {
          const result = await s.execute(statement);
          if (statement.sql.startsWith(`INSERT INTO ${table} `)) {
            inserted = true;
            if (!corrupt) throw new Error("Synthetic failure after actual evidence insertion.");
          }
          return result;
        },
        query: async (statement) => {
          if (inserted && statement.sql.includes(`FROM ${table} `))
            throw new Error("Synthetic canonical readback failure.");
          return s.query(statement);
        },
      });
    }),
});
const component = PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.contactFieldUse;
export const createContactFieldUseContractSuite = (setup: Phase1RepositoryContractSetup) =>
  defineDatabaseContractSuite(component.suiteName, [
    {
      name: component.cases.persistAndResolve,
      run: async (db) => {
        await setup.migrate(db, 167);
        await initialize(db, 167, 3);
        const oldLedger = await db.query(
          sqlStatement(
            "SELECT version,name,sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        const oldExport = await createPortableDataExportV1({
          database: db,
          vaultId: id(1),
          generatedAt: at,
        });
        await setup.migrate(db);
        const ledger = await db.query(
          sqlStatement(
            "SELECT version,name,sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        assert(
          ledger.length === 182 &&
            JSON.stringify(ledger.slice(0, 167)) === JSON.stringify(oldLedger),
          "Qualification migration changed prior ledger identities.",
        );
        const upgraded = await createPortableDataExportV1({
          database: db,
          vaultId: id(1),
          generatedAt: at,
        });
        assert(
          upgraded.sourceSchemaVersion === 182 &&
            upgraded.datasetCount === 61 &&
            upgraded.dataFiles.length === 122 &&
            JSON.stringify(
              upgraded.datasets.filter((d) =>
                oldExport.datasets.some((old) => old.dataset === d.dataset),
              ),
            ) ===
              JSON.stringify(oldExport.datasets.map((d) => ({ ...d, sourceSchemaVersion: 182 }))),
          "Qualification upgrade changed prior canonical export rows.",
        );
        const local = operations(db),
          originalContacts = JSON.stringify(
            await db.query(sqlStatement("SELECT * FROM contact ORDER BY id")),
          );
        for (let n = 0; n < 3; n += 1) {
          const f = await fixtures(n);
          await retain(db, f, 100 + n * 10);
          await record(db, f.review, 103 + n * 10);
          const state = value(await local.readField.execute(f.read, context(200 + n)));
          assert(
            state.assessment?.eligible &&
              state.assessment.rightsBasis === f.rightsBasis &&
              state.latestReview?.id === f.review.reviewId,
            "Stored permission and exact value did not resolve through production operations.",
          );
          for (const text of [
            f.email,
            f.terms,
            "PRIVATE",
            "purposeNote",
            "sourceExcerpt",
            "literalText",
          ])
            assert(
              !JSON.stringify(state).includes(text),
              "Ordinary qualification state disclosed literal contact evidence.",
            );
          assert(
            value(await local.readField.execute(f.read, context(210 + n, due))).assessment
              ?.eligible === false,
            "Expiry did not withhold eligibility.",
          );
          const stored = await db.query(
            sqlStatement(
              "SELECT CAST(raw_text AS BLOB) AS bytes FROM contact_source_snapshot WHERE id=?",
              [f.source.sourceSnapshotId],
            ),
          );
          assert(
            decode(stored[0]?.["bytes"]) === f.body,
            "Stored source lost literal BOM/NUL/Unicode bytes.",
          );
        }
        assert(
          JSON.stringify(await db.query(sqlStatement("SELECT * FROM contact ORDER BY id"))) ===
            originalContacts,
          "Qualification rewrote contacts or confirmation flags.",
        );
        assert(
          (await db.query(sqlStatement("SELECT id FROM job UNION ALL SELECT id FROM job_source")))
            .length === 0,
          "Independent contact review invented a job.",
        );
        const f = await fixtures(),
          revoke = {
            specVersion: 1,
            kind: "revoke_review",
            expectedVaultId: id(1),
            recordId: f.review.reviewId,
            expectedRowVersion: 1,
            contactId: f.read.contactId,
            expectedContactRowVersion: 1,
            fieldName: "email",
          };
        value(await local.control.execute(revoke, context(220, later)));
        assert(
          value(await local.readField.execute(f.read, context(221, later))).assessment?.eligible ===
            false,
          "Revocation left the field qualified.",
        );
        failure(await local.control.execute(revoke, context(220, later)), "conflict");
        await record(
          db,
          { ...f.review, reviewId: id(70), expectedLatestReviewId: f.review.reviewId },
          222,
          later,
        );
        const renewed = value(await local.readField.execute(f.read, context(223, later)));
        assert(
          renewed.latestReview?.fieldRevision === 2 && renewed.assessment?.eligible === true,
          "Deliberate renewal did not use an explicit field revision.",
        );
        await record(
          db,
          { ...f.review, reviewId: id(71), expectedLatestReviewId: id(70) },
          230,
          later,
        );
        value(await local.control.execute({ ...revoke, recordId: id(71) }, context(224, later)));
        const revoked = value(await local.readField.execute(f.read, context(225, later)));
        assert(
          revoked.latestReview?.id === id(71) &&
            revoked.assessment?.eligible === false &&
            (
              await db.query(
                sqlStatement("SELECT revoked_at FROM contact_field_use_review WHERE id=?", [
                  id(70),
                ]),
              )
            )[0]?.["revoked_at"] === null,
          "Latest revocation revived an older field review.",
        );
        const licensed = await fixtures(2);
        value(
          await local.control.execute(
            {
              specVersion: 1,
              kind: "disable_policy",
              expectedVaultId: id(1),
              recordId: licensed.policy.policyId,
              expectedRowVersion: 1,
              sourceSnapshotId: licensed.source.sourceSnapshotId,
              expectedSourceHash: licensed.policy.expectedSourceHash,
            },
            context(226, later),
          ),
        );
        assert(
          value(await local.readField.execute(licensed.read, context(227, later))).assessment
            ?.eligible === false,
          "Disabled permission remained qualified.",
        );
        const changed = await fixtures(1);
        await db.execute(
          sqlStatement("UPDATE contact SET email=?,row_version=2,updated_at=? WHERE id=?", [
            "changed@synthetic.example",
            later,
            changed.read.contactId,
          ]),
        );
        failure(await local.readField.execute(changed.read, context(228, later)), "conflict");
        assert(
          value(
            await local.readField.execute(
              { ...changed.read, expectedContactRowVersion: 2 },
              context(229, later),
            ),
          ).assessment?.eligible === false,
          "Changed current value retained prior qualification.",
        );
        const exported = await createPortableDataExportV1({
          database: db,
          vaultId: id(1),
          generatedAt: later,
        });
        const json = JSON.stringify(exported.datasets);
        assert(
          exported.datasetCount === 61 &&
            exported.dataFiles.length === 122 &&
            exported.datasets.some((d) => d.dataset === "contact_source_snapshot") &&
            json.includes("contact_field_use_review") &&
            json.includes("documented_license_grant") &&
            json.includes("purpose_note"),
          "Export omitted qualification or permission facts.",
        );
      },
    },
    {
      name: component.cases.rejectAndReconcile,
      run: async (db) => {
        await setup.migrate(db);
        await initialize(db, 182);
        const f = await fixtures(),
          local = operations(db);
        assert(
          value(await local.readField.execute(f.read, context(100))).latestReview === null,
          "Legacy contact was backfilled with qualification.",
        );
        for (const [input, table, n] of [
          [f.source, "contact_source_snapshot", 100],
          [f.termsSource, "contact_source_snapshot", 101],
          [f.policy, "contact_source_use_policy", 102],
          [f.review, "contact_field_use_review", 103],
        ] as const) {
          const before = await capture(db);
          failure(
            await operations(fault(db, table)).record.execute(input, context(n)),
            "unavailable",
          );
          assert(
            (await capture(db)) === before,
            "Actual late insertion failure changed canonical evidence.",
          );
          failure(
            await operations(fault(db, table, true)).record.execute(input, context(n)),
            "unavailable",
          );
          assert(
            (await capture(db)) === before,
            "Canonical readback failure committed an unconfirmed record.",
          );
          if (input.kind === "review") {
            for (const change of [
              { expectedContactRowVersion: 2 },
              { expectedLatestReviewId: id(99) },
              { expectedValueHash: "c".repeat(64) },
              { expectedSourceHash: "c".repeat(64) },
              { sourceStartByte: 0, sourceEndByte: new TextEncoder().encode(f.email).length },
            ]) {
              failure(await local.record.execute({ ...input, ...change }, context(n)), "conflict");
              assert(
                (await capture(db)) === before,
                "Stale original intent changed canonical evidence.",
              );
            }
          }
          await record(db, input, n);
        }
        const original = parseContactUseRecordRequestV1({
          ...f.source,
          sourceHash: await hash(f.body),
          operationId: id(100),
          recordedAt: at,
        });
        const before = await capture(db);
        assert(
          value(await local.inspect.execute(original, context(120, later))).state === "matching",
          "Original operation inspection did not find its exact stored source.",
        );
        assert(
          value(
            await local.inspect.execute(
              { ...original, sourceSnapshotId: id(99) },
              context(121, later),
            ),
          ).state === "absent",
          "Missing original observation invented completion.",
        );
        failure(
          await local.record.execute({ ...f.review, reviewId: id(71) }, context(122)),
          "conflict",
        );
        assert(
          (await capture(db)) === before,
          "Read-only inspection or stale retry changed evidence.",
        );
        const target = {
          specVersion: 1 as const,
          expectedVaultId: entityId("vault", id(1)),
          contactId: entityId("contact", f.read.contactId),
          expectedRowVersion: 1,
          expectedCreatedAt: captured,
          expectedUpdatedAt: captured,
          expectedArchivedAt: null,
          expectedCompanyId: null,
          expectedManualCreationOperationId: null,
        };
        const deletion = createContactDeletionRepository(db),
          sources = JSON.stringify(
            await db.query(
              sqlStatement("SELECT id,content_hash FROM contact_source_snapshot ORDER BY id"),
            ),
          ),
          policies = JSON.stringify(
            await db.query(
              sqlStatement("SELECT id,status FROM contact_source_use_policy ORDER BY id"),
            ),
          );
        assert(
          parseContactDeletionResultV1(await deletion.remove(target), target, ["deleted"]).state ===
            "deleted" &&
            parseContactDeletionResultV1(await deletion.inspect(target), target, [
              "absent_complete",
            ]).state === "absent_complete",
          "Normal deletion failed to reconcile owned field reviews.",
        );
        assert(
          (await db.query(sqlStatement("SELECT id FROM contact_field_use_review"))).length === 0 &&
            JSON.stringify(
              await db.query(
                sqlStatement("SELECT id,content_hash FROM contact_source_snapshot ORDER BY id"),
              ),
            ) === sources &&
            JSON.stringify(
              await db.query(
                sqlStatement("SELECT id,status FROM contact_source_use_policy ORDER BY id"),
              ),
            ) === policies,
          "Contact deletion changed shared permission/source evidence or retained an owned review.",
        );
        const request: ContactUseRecordRequestV1 = original;
        assert(
          value(await local.inspect.execute(request, context(123, later))).state === "matching",
          "Retained source inspection depended on deleted contact values.",
        );
      },
    },
  ]);
