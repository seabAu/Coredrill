import { entityId, sourceReference } from "@coredrill/domain";
import { describe, expect, it } from "vitest";

import {
  CAREER_EVIDENCE_STATE_LIMITS,
  createCareerEvidenceState,
  isCareerEvidenceEligibleForExternalContext,
  markCareerEvidenceStale,
  transitionCareerEvidenceVerification,
  type CareerEvidenceVerificationState,
} from "../src/index.js";

const documentSource = () =>
  sourceReference({
    sourceType: "document",
    sourceId: entityId("document", "0199a400-0000-7000-8000-000000000001"),
    pointer: "version/2/block/7",
  });

describe("Career evidence state", () => {
  it("validates, orders, and freezes provenance and privacy-tag state", () => {
    const state = createCareerEvidenceState({
      source: documentSource(),
      verificationState: "source_backed",
      privacyTags: ["nda", "confidential-client"],
    });

    expect(state).toEqual({
      source: documentSource(),
      verificationState: "source_backed",
      privacyTags: ["confidential-client", "nda"],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.source)).toBe(true);
    expect(Object.isFrozen(state.privacyTags)).toBe(true);
  });

  it("requires durable provenance before evidence can be source-backed", () => {
    expect(() =>
      createCareerEvidenceState({ source: null, verificationState: "source_backed" }),
    ).toThrow("requires a durable source reference");
  });

  it("rejects unknown verification state and unsafe or ambiguous privacy tags", () => {
    expect(() =>
      createCareerEvidenceState({
        source: null,
        verificationState: "verified" as CareerEvidenceVerificationState,
      }),
    ).toThrow("verification state is invalid");
    expect(() =>
      createCareerEvidenceState({
        source: null,
        verificationState: "user_confirmed",
        privacyTags: ["Contains private words"],
      }),
    ).toThrow("content-free identifiers");
    expect(() =>
      createCareerEvidenceState({
        source: null,
        verificationState: "user_confirmed",
        privacyTags: ["nda", "nda"],
      }),
    ).toThrow("cannot contain duplicates");
    expect(() =>
      createCareerEvidenceState({
        source: null,
        verificationState: "user_confirmed",
        privacyTags: Array.from(
          { length: CAREER_EVIDENCE_STATE_LIMITS.maxPrivacyTags + 1 },
          (_, index) => `tag-${String(index)}`,
        ),
      }),
    ).toThrow("too many privacy tags");
  });

  it("marks evidence stale without dropping its source or privacy controls", () => {
    const state = createCareerEvidenceState({
      source: documentSource(),
      verificationState: "source_backed",
      privacyTags: ["nda"],
    });

    const stale = markCareerEvidenceStale(state);
    expect(stale).toEqual({
      source: documentSource(),
      verificationState: "stale",
      privacyTags: ["nda"],
    });
    expect(transitionCareerEvidenceVerification(stale, "user_confirmed")).toEqual({
      source: documentSource(),
      verificationState: "user_confirmed",
      privacyTags: ["nda"],
    });
  });

  it("allows only reviewed untagged evidence into external-context candidates", () => {
    const state = (
      verificationState: CareerEvidenceVerificationState,
      privacyTags: string[] = [],
    ) =>
      createCareerEvidenceState({
        source: documentSource(),
        verificationState,
        privacyTags,
      });

    expect(isCareerEvidenceEligibleForExternalContext(state("source_backed"))).toBe(true);
    expect(isCareerEvidenceEligibleForExternalContext(state("user_confirmed"))).toBe(true);
    expect(isCareerEvidenceEligibleForExternalContext(state("imported"))).toBe(false);
    expect(isCareerEvidenceEligibleForExternalContext(state("stale"))).toBe(false);
    expect(isCareerEvidenceEligibleForExternalContext(state("disputed"))).toBe(false);
    expect(isCareerEvidenceEligibleForExternalContext(state("user_confirmed", ["nda"]))).toBe(
      false,
    );
  });
});
