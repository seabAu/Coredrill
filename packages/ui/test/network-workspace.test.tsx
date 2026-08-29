import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NETWORK_ACTIONS,
  NETWORK_CONTACT_POINT_ORIGINS,
  NETWORK_INTERACTION_TYPES,
  NETWORK_TABS,
  NetworkWorkspace,
  isNetworkTab,
  type NetworkTabId,
  type NetworkWorkspaceModel,
} from "../src/index.js";

const MODEL = Object.freeze({
  companies: Object.freeze([
    Object.freeze({
      canonicalName: "Northstar Health",
      domain: "northstar.example.test",
      id: "company-northstar",
      jobs: Object.freeze([
        Object.freeze({ id: "job-one", statusLabel: "Interviewing", title: "Operations Lead" }),
      ]),
      notes: "Review the operating model.",
      outcomes: Object.freeze([Object.freeze({ count: 1, id: "outcome-one", label: "Interview" })]),
      publicFacts: Object.freeze([
        Object.freeze({
          id: "fact-sector",
          label: "Sector",
          sourceLabel: "Official overview",
          sourceUrl: "https://northstar.example.test/about",
          value: "Healthcare software",
        }),
      ]),
      salaryObservations: Object.freeze([
        Object.freeze({
          id: "salary-one",
          rangeLabel: "$120k–$145k · annual",
          sourceLabel: "Disclosed role range",
        }),
      ]),
      websiteUrl: "https://northstar.example.test",
    }),
  ]),
  contacts: Object.freeze([
    Object.freeze({
      companyId: "company-northstar",
      contactPoints: Object.freeze([
        Object.freeze({
          id: "point-profile",
          kind: "public-profile" as const,
          origin: "explicitly-public" as const,
          provenanceLabel: "Public conference profile",
          sourceUrl: "https://events.example.test/speakers/maya",
          value: "events.example.test/speakers/maya",
        }),
      ]),
      id: "contact-maya",
      identityOrigin: "explicitly-public" as const,
      identityProvenanceLabel: "Public conference profile",
      identitySourceUrl: "https://events.example.test/speakers/maya",
      lastInteractionAtLabel: "Today",
      name: "Maya Chen",
      notes: "Discussed operating cadence.",
      role: "Director, Product Operations",
    }),
  ]),
  interactions: Object.freeze([
    Object.freeze({
      companyId: "company-northstar",
      contactId: "contact-maya",
      direction: "inbound" as const,
      id: "interaction-one",
      jobTitle: "Operations Lead",
      nextActionAtLabel: "Tomorrow",
      occurredAtLabel: "Today",
      summary: "Discussed the interview sequence.",
      type: "call" as const,
    }),
  ]),
  reminder: Object.freeze({
    companyId: "company-northstar",
    contactId: "contact-maya",
    dueAtLabel: "Due tomorrow",
    id: "reminder-one",
    title: "Decide whether to follow up",
  }),
} as const satisfies NetworkWorkspaceModel);

const renderNetwork = (activeTab: NetworkTabId, model: NetworkWorkspaceModel = MODEL) =>
  renderToStaticMarkup(createElement(NetworkWorkspace, { activeTab, model }));

describe("NetworkWorkspace contract", () => {
  it("freezes the reviewed tabs, interaction types, provenance origins, and action vocabulary", () => {
    expect(NETWORK_TABS).toEqual(["companies", "contacts", "interactions"]);
    expect(NETWORK_INTERACTION_TYPES).toEqual([
      "note",
      "call",
      "email-logged",
      "meeting",
      "referral",
      "follow-up",
    ]);
    expect(NETWORK_CONTACT_POINT_ORIGINS).toEqual([
      "user-entered",
      "explicitly-public",
      "licensed",
    ]);
    expect(NETWORK_ACTIONS).toEqual([
      "select-company",
      "select-contact",
      "add-company",
      "add-contact",
      "edit-company-notes",
      "edit-contact-notes",
      "open-company-job",
      "log-interaction",
      "snooze-reminder",
      "disable-reminder",
    ]);
    expect(isNetworkTab("contacts")).toBe(true);
    expect(isNetworkTab("outreach")).toBe(false);
  });

  it("relates company jobs, contacts, facts, salary observations, outcomes, and notes", () => {
    const markup = renderNetwork("companies");

    expect(markup).toContain('data-network-tab="companies"');
    expect(markup).toContain("Northstar Health");
    expect(markup).toContain("Saved jobs");
    expect(markup).toContain("Related contacts");
    expect(markup).toContain('aria-label="Company fact provenance"');
    expect(markup).toContain("Disclosed role range");
    expect(markup).toContain("Outcome history");
  });

  it("renders only provenance-bound contact points and leaves the no-guess rule explicit", () => {
    const markup = renderNetwork("contacts");

    expect(markup).toContain('data-network-tab="contacts"');
    expect(markup).toContain('aria-label="Contact point provenance"');
    expect(markup).toContain("explicitly public");
    expect(markup).toContain("Public conference profile");
    expect(markup).toContain("Identity provenance");
    expect(markup).toContain("never guesses them");
  });

  it("accepts only stable selections that exist in the local relationship model", () => {
    const markup = renderToStaticMarkup(
      createElement(NetworkWorkspace, {
        activeTab: "contacts",
        model: MODEL,
        selectedContactId: "contact-maya",
      }),
    );
    expect(markup).toContain("Maya Chen");
    expect(() =>
      renderToStaticMarkup(
        createElement(NetworkWorkspace, {
          activeTab: "companies",
          model: MODEL,
          selectedCompanyId: "company-missing",
        }),
      ),
    ).toThrowError("Network workspace selection is invalid.");
  });

  it("renders append-only history, neutral reminder controls, and a bounded log-only composer", () => {
    const markup = renderNetwork("interactions");

    expect(markup).toContain('data-network-tab="interactions"');
    expect(markup).toContain('aria-label="Network interaction history"');
    expect(markup).toContain("Snooze");
    expect(markup).toContain("Turn off reminder");
    expect(markup).toContain("It cannot send email, messages, or outreach.");
    expect(markup).toContain('maxLength="2000"');
    expect(markup).toContain("Email logged");
  });

  it("fails closed for guessed contact data, unsafe source URLs, and dangling relationships", () => {
    expect(() =>
      renderNetwork("contacts", {
        ...MODEL,
        contacts: Object.freeze([
          {
            ...MODEL.contacts[0]!,
            contactPoints: Object.freeze([
              {
                ...MODEL.contacts[0]!.contactPoints[0]!,
                origin: "user-entered" as const,
              },
            ]),
          },
        ]),
      }),
    ).toThrowError("Network contact record is invalid.");

    expect(() =>
      renderNetwork("companies", {
        ...MODEL,
        companies: Object.freeze([
          {
            ...MODEL.companies[0]!,
            publicFacts: Object.freeze([
              { ...MODEL.companies[0]!.publicFacts[0]!, sourceUrl: "http://unsafe.example.test" },
            ]),
          },
        ]),
      }),
    ).toThrowError("Network company record is invalid.");

    expect(() =>
      renderNetwork("interactions", {
        ...MODEL,
        interactions: Object.freeze([{ ...MODEL.interactions[0]!, contactId: "contact-missing" }]),
      }),
    ).toThrowError("Network interaction record is invalid.");
  });
});
