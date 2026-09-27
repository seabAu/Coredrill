import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CaptureInboxReview,
  type CaptureInboxEvidence,
  type CaptureInboxPreviewItem,
} from "../src/index.js";

const HOSTILE_EVIDENCE = Object.freeze({
  id: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a56",
  fieldName: "title",
  fieldGroup: "role_company",
  value: "<svg onload=globalThis.__ran=true>",
  method: "user",
  confidence: 1,
  confirmationState: "unconfirmed",
  conflictState: "none",
  fieldCandidateCount: 1,
  pointer: "/fields/title",
  sourceExcerpt: "<svg onload=globalThis.__ran=true>",
  targetSectionId: null,
}) satisfies CaptureInboxEvidence;

const HOSTILE_ITEM = Object.freeze({
  envelopeId: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a55",
  label: '<img src="https://tracker.invalid/title" onerror="globalThis.__ran=true">',
  capturedAt: "2026-08-30T13:30:00.000Z",
  captureMethod: "file",
  sourceKind: "saved_json",
  sourceUrl: "https://jobs.example.test/role",
  sourceState: Object.freeze({
    specVersion: 1 as const,
    kind: "available" as const,
    heading: "Retained source is ready for review",
    explanation: "Review uses only the local capture.",
    retainedEvidence: "The original capture and provenance remain in this local review.",
    promotionAllowed: true,
    refreshPerformed: false as const,
    manualFallback: null,
  }),
  sections: Object.freeze([
    Object.freeze({
      id: "api-payload",
      label: "Structured JSON",
      pointer: "/content/apiPayload",
      format: "json" as const,
      text: '{"description":"<script>globalThis.__ran=true</script>"}',
    }),
  ]),
  evidence: Object.freeze([HOSTILE_EVIDENCE]),
  reviewState: "pending",
  snoozedUntil: null,
  reviewRowVersion: 1,
  eligibleCandidateIds: Object.freeze([HOSTILE_EVIDENCE.id]),
  reviewDecisions: Object.freeze([
    Object.freeze({
      fieldName: "title",
      selectedCandidateId: HOSTILE_EVIDENCE.id,
      disposition: "accept",
      reasons: Object.freeze([]),
    }),
  ]),
  mergeTargets: Object.freeze([]),
} as const satisfies CaptureInboxPreviewItem);

describe("CaptureInboxReview", () => {
  it("renders source and evidence strings as escaped inert text", () => {
    const markup = renderToStaticMarkup(
      createElement(CaptureInboxReview, { items: [HOSTILE_ITEM] }),
    );

    expect(markup).toContain("Review captured evidence");
    expect(markup).toContain("1 capture awaiting review");
    expect(markup).toContain("Reviewing 1 of 1");
    expect(markup).toContain("Accept high-confidence fields");
    expect(markup).toContain("Save as new job");
    expect(markup).toContain("Snooze one week");
    expect(markup).toContain("Discard");
    expect(markup).toContain('aria-controls="');
    expect(markup).toContain('aria-labelledby="');
    expect(markup).toContain("&lt;img src=&quot;https://tracker.invalid/title&quot;");
    expect(markup).toContain("&lt;script&gt;globalThis.__ran=true&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders loading, error, and empty states without source content", () => {
    expect(
      renderToStaticMarkup(createElement(CaptureInboxReview, { items: [], state: "loading" })),
    ).toContain("Reading validated local captures");
    expect(
      renderToStaticMarkup(createElement(CaptureInboxReview, { items: [], state: "error" })),
    ).toContain("No source content was rendered");
    expect(renderToStaticMarkup(createElement(CaptureInboxReview, { items: [] }))).toContain(
      "No durable captures yet",
    );
  });

  it("groups candidates and exposes method, confidence, confirmation, excerpts, and conflicts", () => {
    const markup = renderToStaticMarkup(
      createElement(CaptureInboxReview, {
        items: [
          {
            ...HOSTILE_ITEM,
            evidence: [
              {
                ...HOSTILE_EVIDENCE,
                conflictState: "unresolved",
                fieldCandidateCount: 2,
              },
              {
                ...HOSTILE_EVIDENCE,
                id: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a57",
                value: "Platform Engineer",
                sourceExcerpt: "Platform Engineer",
                confirmationState: "user_confirmed",
                conflictState: "unresolved",
                fieldCandidateCount: 2,
              },
              {
                ...HOSTILE_EVIDENCE,
                id: "018f4e87-2bf3-7cc3-98c8-978e8b4c9a58",
                fieldName: "custom_detail",
                fieldGroup: "additional",
                value: "Visible fallback",
                sourceExcerpt: "Visible fallback",
              },
            ],
          },
        ],
      }),
    );

    expect(markup).toContain("Role &amp; company");
    expect(markup).toContain("Additional details");
    expect(markup).toContain("Method: User");
    expect(markup).toContain("100% confidence");
    expect(markup).toContain("Needs user confirmation");
    expect(markup).toContain("User confirmed");
    expect(markup).toContain("Unresolved conflict · 2 candidates");
    expect(markup).toContain("Visible fallback");
    expect(markup).toContain("View source for Title");
    console.info(
      `REV002_COMPONENT_PROOF ${JSON.stringify({
        documentedFieldGroup: true,
        unknownFieldFallbackGroup: true,
        methodVisible: true,
        confidenceVisible: true,
        sourceExcerptVisible: true,
        confirmationStatesVisible: true,
        unresolvedConflictVisible: true,
        conflictUsesText: true,
      })}`,
    );
  });

  it("renders every source condition without refreshing and blocks policy-denied promotion", () => {
    const conditions = [
      ["available", "Retained source is ready for review", null, true],
      ["expired", "Listing appears expired", "Enter current details manually", true],
      ["changed", "Source content changed", "Paste updated listing", true],
      ["blocked", "Source use is blocked", "Enter job manually", false],
      ["unsupported", "Page content is unsupported", "Paste listing text", true],
    ] as const;

    for (const [kind, heading, fallbackLabel, promotionAllowed] of conditions) {
      const markup = renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [
            {
              ...HOSTILE_ITEM,
              sourceState: {
                ...HOSTILE_ITEM.sourceState,
                kind,
                heading,
                promotionAllowed,
                manualFallback:
                  fallbackLabel === null
                    ? null
                    : {
                        mode: kind === "changed" || kind === "unsupported" ? "paste" : "manual",
                        label: fallbackLabel,
                        instruction: "Use retained local evidence only.",
                      },
              },
            },
          ],
          onAction: async () => undefined,
          onManualFallback: () => undefined,
        }),
      );

      expect(markup).toContain(`data-source-state="${kind}"`);
      expect(markup).toContain(heading);
      expect(markup).toContain("No automatic refresh was performed");
      if (fallbackLabel !== null) expect(markup).toContain(fallbackLabel);
      if (!promotionAllowed) {
        expect(markup).toContain(
          '<button disabled="" type="button">Accept high-confidence fields</button>',
        );
      }
    }

    console.info(
      `REV005_COMPONENT_PROOF ${JSON.stringify({ states: conditions.map(([kind]) => kind), noRefresh: true, blockedPromotion: true, fallbackActions: 4 })}`,
    );
  });

  it("fails closed for unsafe URLs and dangling evidence targets", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [{ ...HOSTILE_ITEM, sourceUrl: "javascript:alert(1)" }],
        }),
      ),
    ).toThrowError("Capture preview item is invalid.");
    expect(() =>
      renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [
            {
              ...HOSTILE_ITEM,
              evidence: [{ ...HOSTILE_EVIDENCE, targetSectionId: "missing" }],
            },
          ],
        }),
      ),
    ).toThrowError("Capture preview evidence is invalid.");
    expect(() =>
      renderToStaticMarkup(
        createElement(CaptureInboxReview, {
          items: [
            {
              ...HOSTILE_ITEM,
              evidence: [
                {
                  ...HOSTILE_EVIDENCE,
                  conflictState: "unresolved",
                  fieldCandidateCount: 1,
                },
              ],
            },
          ],
        }),
      ),
    ).toThrowError("Capture preview evidence is invalid.");
  });
});
