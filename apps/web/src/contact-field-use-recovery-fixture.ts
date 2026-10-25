import { createContactFieldUseOperations, type ApplicationResult } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { createContactFieldUseRepository, type DatabasePort } from "@coredrill/storage-core";

const id = (n: number) => `0198e123-0000-7000-8000-${String(n).padStart(12, "0")}`;
const capturedAt = instant("2026-10-20T12:00:00.000Z");
const reviewedAt = instant("2026-10-24T19:00:00.000Z");
const changedAt = instant("2026-10-24T19:05:00.000Z");
const due = instant("2026-11-01T12:00:00.000Z");
const hash = async (text: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const value = <T>(result: ApplicationResult<T>): T => {
  if (!result.ok) throw new Error("Synthetic qualification recovery operation failed.");
  return result.value;
};
const context = (n: number, initiatedAt = reviewedAt) => ({
  operationId: entityId("application-operation", id(n)),
  initiatedAt,
});

/** Explicit verification-page fixture only. Never seed or classify a normal user's contacts. */
export const seedContactFieldUseRecoveryFixture = async (
  database: DatabasePort,
  expectedVaultId: string,
): Promise<void> => {
  const ops = createContactFieldUseOperations(
    createContactFieldUseRepository(database, hash),
    hash,
  );
  const contactId = "0198d9d4-0000-7000-8000-000000000040";
  const fields = [
    [
      "email",
      "manual@synthetic.example",
      "official_employer_page",
      "explicit_public_job_search_contact",
    ],
    ["name", "Synthetic manually entered contact", "public_dataset", "compatible_public_reuse"],
    [
      "public_profile_url",
      "https://synthetic.example/people/manual",
      "licensed_material",
      "documented_license_grant",
    ],
  ] as const;
  for (const [n, [fieldName, literalValue, sourceClass, permissionKind]] of fields.entries()) {
    const sourceSnapshotId = id(10 + n * 10),
      termsSnapshotId = id(11 + n * 10),
      policyId = id(12 + n * 10),
      reviewId = id(13 + n * 10);
    const termsExcerpt = `Synthetic ${permissionKind} for manual job-search review; not a real-world source approval.`;
    const literalText = `\uFEFFSynthetic ${sourceClass}\n${literalValue}\0<script>inert</script>尾🧭`;
    const termsText = `\uFEFF${termsExcerpt}\0Retained synthetic terms尾`;
    const sourceStartByte = new TextEncoder().encode(
      literalText.slice(0, literalText.indexOf(literalValue)),
    ).length;
    const source = {
      specVersion: 1,
      kind: "source",
      expectedVaultId,
      sourceSnapshotId,
      sourceClass,
      sourceUrl: "https://synthetic.example/recovery",
      capturedAt,
      literalText,
    };
    value(await ops.record.execute(source, context(100 + n * 10)));
    value(
      await ops.record.execute(
        { ...source, sourceSnapshotId: termsSnapshotId, literalText: termsText },
        context(101 + n * 10),
      ),
    );
    const sourceHash = await hash(literalText);
    value(
      await ops.record.execute(
        {
          specVersion: 1,
          kind: "policy",
          expectedVaultId,
          policyId,
          sourceSnapshotId,
          expectedSourceHash: sourceHash,
          fieldName,
          termsSnapshotId,
          expectedTermsHash: await hash(termsText),
          termsStartByte: 3,
          termsEndByte: 3 + new TextEncoder().encode(termsExcerpt).length,
          termsExcerpt,
          permissionKind,
          purpose: "job_search",
          reviewDueAt: due,
          acknowledgement: "I reviewed this source's permitted field use.",
        },
        context(102 + n * 10),
      ),
    );
    const review = {
      specVersion: 1,
      kind: "review",
      expectedVaultId,
      reviewId,
      contactId,
      expectedContactRowVersion: 1,
      expectedLatestReviewId: null,
      fieldName,
      expectedValueHash: await hash(literalValue),
      sourceSnapshotId,
      expectedSourceHash: sourceHash,
      sourceStartByte,
      sourceEndByte: sourceStartByte + new TextEncoder().encode(literalValue).length,
      sourceExcerpt: literalValue,
      policyId,
      policyRevision: 1,
      purpose: "job_search",
      purposeNote: `\uFEFFSynthetic ${fieldName} manual-use review\0尾`,
      reviewDueAt: due,
      expiresAt: due,
      acknowledgement: "I reviewed this exact contact field and purpose.",
    };
    value(await ops.record.execute(review, context(103 + n * 10)));
    if (n === 0) {
      // An unrevoked older eligible row must not revive after revoking the latest.
      value(
        await ops.record.execute(
          { ...review, reviewId: id(50), expectedLatestReviewId: reviewId },
          context(140),
        ),
      );
      value(
        await ops.control.execute(
          {
            specVersion: 1,
            kind: "revoke_review",
            expectedVaultId,
            recordId: id(50),
            expectedRowVersion: 1,
            contactId,
            expectedContactRowVersion: 1,
            fieldName,
          },
          context(141, changedAt),
        ),
      );
    }
    if (n === 1)
      value(
        await ops.control.execute(
          {
            specVersion: 1,
            kind: "disable_policy",
            expectedVaultId,
            recordId: policyId,
            expectedRowVersion: 1,
            sourceSnapshotId,
            expectedSourceHash: sourceHash,
          },
          context(142, changedAt),
        ),
      );
    const state = value(
      await ops.readField.execute(
        { specVersion: 1, expectedVaultId, contactId, expectedContactRowVersion: 1, fieldName },
        context(150 + n, changedAt),
      ),
    );
    if (state.assessment?.eligible !== (n === 2))
      throw new Error("Synthetic qualification lifecycle was not preserved.");
  }
};
