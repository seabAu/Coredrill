import { describe, expect, it, vi } from "vitest";
import {
  assessContactFieldUseV1,
  parseContactFieldUseEvidenceV1,
} from "../src/contact-field-use.js";

// Synthetic metadata only: no real people, source content or production policy.
const id = (n: number) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const captured = "2026-10-20T12:00:00.000Z";
const reviewed = "2026-10-21T12:00:00.000Z";
const now = "2026-10-24T12:00:00.000Z";
const due = "2026-11-01T12:00:00.000Z";
const expires = "2026-11-10T12:00:00.000Z";
const hash = "a".repeat(64);
const sourceHash = "b".repeat(64);
const fixture = () => ({
  specVersion: 1,
  vaultId: id(1),
  contactId: id(2),
  fieldName: "email",
  currentValueHash: hash,
  now,
  source: {
    specVersion: 1,
    id: id(3),
    vaultId: id(1),
    acquisition: "user_supplied",
    sourceClass: "official_employer_page",
    sourceUrl: "https://synthetic.example/team",
    capturedAt: captured,
    contentHash: sourceHash,
  },
  review: {
    specVersion: 1,
    id: id(4),
    vaultId: id(1),
    contactId: id(2),
    fieldName: "email",
    valueHash: hash,
    sourceSnapshotId: id(3),
    sourceSnapshotHash: sourceHash,
    pointer: "/synthetic/team/email",
    excerpt: "Synthetic inert <b>source evidence</b> 🧭",
    policyId: id(5),
    policyRevision: 1,
    purpose: "job_search",
    purposeNote: "Review this employer's advertised opportunity manually.",
    reviewedAt: reviewed,
    reviewDueAt: due,
    expiresAt: expires,
    revokedAt: null,
  },
});
const policy = () => ({
  specVersion: 1,
  id: id(5),
  vaultId: id(1),
  revision: 1,
  status: "enabled",
  sourceSnapshotId: id(3),
  sourceSnapshotHash: sourceHash,
  sourceUrl: "https://synthetic.example/team",
  sourceClass: "official_employer_page",
  fieldName: "email",
  rightsBasis: "public",
  purpose: "job_search",
  usage: "display_and_manual_use",
  reviewedAt: captured,
  reviewDueAt: expires,
});

describe("exact-value contact field-use qualification contract", () => {
  it.each(["public", "licensed"])("accepts independently reviewed %s scope", (basis) => {
    const input = fixture();
    const resolved = policy();
    resolved.rightsBasis = basis;
    if (basis === "licensed") {
      input.source.sourceClass = "licensed_material";
      resolved.sourceClass = "licensed_material";
    }
    const resolve = vi.fn(() => resolved);
    expect(assessContactFieldUseV1(input, resolve)).toEqual({
      specVersion: 1,
      eligible: true,
      reason: "reviewed_basis_current",
      rightsBasis: basis,
      reviewId: id(4),
      policyId: id(5),
      validUntil: due,
    });
    expect(resolve).toHaveBeenCalledExactlyOnceWith(id(5));
  });

  it.each(["name", "role", "email", "phone", "public_profile_url"])(
    "requires independently scoped policy for %s",
    (fieldName) => {
      const input = fixture();
      input.fieldName = input.review.fieldName = fieldName;
      expect(assessContactFieldUseV1(input, () => ({ ...policy(), fieldName })).eligible).toBe(
        true,
      );
    },
  );

  it.each([
    [
      "missing current value",
      (v: ReturnType<typeof fixture>) => ({ ...v, currentValueHash: null }),
    ],
    [
      "changed value",
      (v: ReturnType<typeof fixture>) => ({ ...v, currentValueHash: "c".repeat(64) }),
    ],
    ["foreign vault", (v: ReturnType<typeof fixture>) => ({ ...v, vaultId: id(6) })],
    ["foreign contact", (v: ReturnType<typeof fixture>) => ({ ...v, contactId: id(6) })],
    ["other field", (v: ReturnType<typeof fixture>) => ({ ...v, fieldName: "phone" })],
    ["future review", (v: ReturnType<typeof fixture>) => ({ ...v, now: captured })],
    ["review due equality", (v: ReturnType<typeof fixture>) => ({ ...v, now: due })],
    ["expired", (v: ReturnType<typeof fixture>) => ({ ...v, now: expires })],
    [
      "revoked",
      (v: ReturnType<typeof fixture>) => ({ ...v, review: { ...v.review, revokedAt: now } }),
    ],
    [
      "different source",
      (v: ReturnType<typeof fixture>) => ({ ...v, source: { ...v.source, id: id(6) } }),
    ],
    [
      "changed snapshot",
      (v: ReturnType<typeof fixture>) => ({
        ...v,
        source: { ...v.source, contentHash: "c".repeat(64) },
      }),
    ],
  ] as const)("withholds %s without policy lookup", (_name, change) => {
    const resolve = vi.fn(policy);
    const result = assessContactFieldUseV1(change(fixture()), resolve);
    expect(result.eligible).toBe(false);
    expect(result.rightsBasis).toBeNull();
    expect(result.validUntil).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { ...fixture(), specVersion: 2 },
    { ...fixture(), licenseNote: "public; trust me" },
    { ...fixture(), userConfirmed: true },
    { ...fixture(), confidence: 1 },
    { ...fixture(), currentValueHash: "A".repeat(64) },
    { ...fixture(), now: "2026-10-24" },
    { ...fixture(), review: { ...fixture().review, purpose: "outreach" } },
    { ...fixture(), review: { ...fixture().review, purposeNote: " " } },
    { ...fixture(), review: { ...fixture().review, purposeNote: "\ud800" } },
    { ...fixture(), review: { ...fixture().review, excerpt: "🧭".repeat(4097) } },
    { ...fixture(), review: { ...fixture().review, pointer: "" } },
    { ...fixture(), review: { ...fixture().review, policyRevision: 0 } },
    { ...fixture(), review: { ...fixture().review, reviewedAt: expires } },
    { ...fixture(), source: { ...fixture().source, acquisition: "network_connector" } },
    { ...fixture(), source: { ...fixture().source, sourceUrl: "javascript:bad" } },
    { ...fixture(), source: { ...fixture().source, jobId: id(6) } },
  ])("rejects malformed/unsupported evidence without resolver (%#)", (input) => {
    const resolve = vi.fn(policy);
    expect(() => parseContactFieldUseEvidenceV1(input)).toThrow(
      "Invalid contact field-use evidence.",
    );
    expect(assessContactFieldUseV1(input, resolve)).toMatchObject({
      eligible: false,
      reason: "invalid_evidence",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    {},
    { ...policy(), id: id(6) },
    { ...policy(), vaultId: id(6) },
    { ...policy(), revision: 2 },
    { ...policy(), status: "disabled" },
    { ...policy(), sourceSnapshotId: id(6) },
    { ...policy(), sourceSnapshotHash: "c".repeat(64) },
    { ...policy(), sourceUrl: "https://synthetic.example/other" },
    { ...policy(), sourceClass: "public_dataset" },
    { ...policy(), fieldName: "phone" },
    { ...policy(), rightsBasis: "licensed" },
    { ...policy(), purpose: "marketing" },
    { ...policy(), usage: "display_only" },
    { ...policy(), reviewedAt: now },
    { ...policy(), reviewDueAt: now },
    { ...policy(), connectorId: "greenhouse.job-board" },
  ])("does not substitute absent, stale, mismatched or job-only policy (%#)", (resolved) => {
    expect(assessContactFieldUseV1(fixture(), () => resolved)).toMatchObject({
      eligible: false,
      rightsBasis: null,
      validUntil: null,
    });
  });

  it("redacts policy resolver failures", () => {
    expect(
      assessContactFieldUseV1(fixture(), () => {
        throw new Error("private sentinel");
      }),
    ).toEqual({
      specVersion: 1,
      eligible: false,
      reason: "policy_unavailable",
      rightsBasis: null,
      reviewId: id(4),
      policyId: id(5),
      validUntil: null,
    });
  });

  it("keeps compatibility-reviewed public datasets distinct from licensed material", () => {
    const input = fixture();
    input.source.sourceClass = "public_dataset";
    expect(
      assessContactFieldUseV1(input, () => ({ ...policy(), sourceClass: "public_dataset" })),
    ).toMatchObject({ eligible: true, rightsBasis: "public" });
    expect(
      assessContactFieldUseV1(input, () => ({
        ...policy(),
        sourceClass: "public_dataset",
        rightsBasis: "licensed",
      })),
    ).toMatchObject({ eligible: false, reason: "policy_not_current_or_applicable" });
  });

  it("accepts review-time equality but not a source captured after the review", () => {
    expect(assessContactFieldUseV1({ ...fixture(), now: reviewed }, policy).eligible).toBe(true);
    const input = fixture();
    input.source.capturedAt = now;
    const resolve = vi.fn(policy);
    expect(assessContactFieldUseV1(input, resolve)).toMatchObject({
      eligible: false,
      reason: "review_not_current",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not allow resolver-side mutation of the caller's evidence to rebind the assessment", () => {
    const input = fixture();
    const result = assessContactFieldUseV1(input, () => {
      input.currentValueHash = "c".repeat(64);
      input.review.policyRevision = 2;
      input.source.sourceUrl = "https://changed.example/";
      return policy();
    });
    expect(result).toMatchObject({ eligible: true, reviewId: id(4), policyId: id(5) });
  });

  it("rejects asynchronous policy output instead of treating an unresolved lookup as approval", () => {
    expect(assessContactFieldUseV1(fixture(), async () => policy())).toMatchObject({
      eligible: false,
      reason: "policy_not_current_or_applicable",
    });
  });

  it("uses the earliest independent expiry and rejects its exact boundary", () => {
    const policyDue = "2026-10-25T12:00:00.000Z";
    const resolve = () => ({ ...policy(), reviewDueAt: policyDue });
    expect(assessContactFieldUseV1(fixture(), resolve).validUntil).toBe(policyDue);
    expect(assessContactFieldUseV1({ ...fixture(), now: policyDue }, resolve).eligible).toBe(false);
    const input = fixture();
    input.review.expiresAt = policyDue;
    expect(assessContactFieldUseV1(input, policy).validUntil).toBe(policyDue);
    expect(assessContactFieldUseV1({ ...input, now: policyDue }, policy).eligible).toBe(false);
  });

  it("copies and freezes literal source evidence without promoting or retaining field values", () => {
    const input = fixture();
    const parsed = parseContactFieldUseEvidenceV1(input);
    input.source.sourceUrl = "https://mutated.example/";
    input.review.excerpt = "mutated";
    expect(parsed.source.sourceUrl).toBe(fixture().source.sourceUrl);
    expect(parsed.review.excerpt).toBe(fixture().review.excerpt);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.source)).toBe(true);
    expect(Object.isFrozen(parsed.review)).toBe(true);
    const result = assessContactFieldUseV1(fixture(), policy);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("excerpt");
    expect(JSON.stringify(result)).not.toContain("sourceUrl");
    expect(JSON.stringify(result)).not.toContain("valueHash");
  });
});
