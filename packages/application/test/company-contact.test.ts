import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { confidence, entityId, instant, webUrl } from "@coredrill/domain";

import {
  CompanyContactError,
  createCompanyContactOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type CompanyContactPort,
  type CompanyDto,
  type ContactDto,
} from "../src/index.js";

const COMPANY_ID = entityId("company", "0198e203-1000-7000-8000-000000000001");
const CONTACT_ID = entityId("contact", "0198e203-1000-7000-8000-000000000002");
const PROVENANCE_ID = entityId("provenance", "0198e203-1000-7000-8000-000000000003");
const ROLE_PROVENANCE_ID = entityId("provenance", "0198e203-1000-7000-8000-000000000004");
const CONTACT_LINK_IDS = [
  entityId("contact-point-provenance", "0198e203-1000-7000-8000-000000000010"),
  entityId("contact-point-provenance", "0198e203-1000-7000-8000-000000000011"),
] as const;
const NOW = instant("2026-08-28T20:00:00.000Z");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e203-1000-7000-8000-000000000020"),
  initiatedAt: NOW,
};

const company = (): CompanyDto => ({
  id: COMPANY_ID,
  canonicalName: "Acme Research",
  websiteUrl: webUrl("https://acme.example/careers"),
  domain: "acme.example",
  locationId: null,
  notes: "Promising local-first team.",
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const manualContact = (): ContactDto => ({
  id: CONTACT_ID,
  companyId: COMPANY_ID,
  name: "Avery Rivera",
  role: "Engineering manager",
  email: "avery@acme.example",
  phone: null,
  publicProfileUrl: null,
  confidence: null,
  userConfirmed: true,
  notes: "Met at the local TypeScript meetup.",
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const sourceContact = (): ContactDto => ({
  ...manualContact(),
  role: "Director of Engineering",
  email: null,
  userConfirmed: false,
  confidence: confidence(0.82),
  notes: "",
});

const companyContactPort = (): CompanyContactPort => ({
  createCompany: vi.fn(async () => company()),
  createContact: vi.fn(async () => manualContact()),
});

const operationsFor = (companyContacts: CompanyContactPort) => {
  let provenanceLinkIndex = 0;
  return createCompanyContactOperations({
    companyContacts,
    createCompanyId: () => COMPANY_ID,
    createContactId: () => CONTACT_ID,
    createContactProvenanceLinkId: () => CONTACT_LINK_IDS[provenanceLinkIndex++]!,
    hashContactValue: vi.fn(async (value: string) =>
      value === "Avery Rivera" ? "a".repeat(64) : "b".repeat(64),
    ),
  });
};

describe("company and contact application operations", () => {
  it("creates a local company with normalized relationship fields", async () => {
    const companyContacts = companyContactPort();
    const { createCompanyCommand } = operationsFor(companyContacts);

    expect(createCompanyCommand).toMatchObject({
      kind: "command",
      name: "CreateCompanyCommand",
      transactional: true,
    });
    const result = await createCompanyCommand.execute(
      {
        origin: "user_entered",
        canonicalName: "Acme Research",
        websiteUrl: "https://acme.example/careers",
        domain: "ACME.EXAMPLE",
        notes: "Promising local-first team.",
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: company() });
    expect(companyContacts.createCompany).toHaveBeenCalledWith({
      id: COMPANY_ID,
      canonicalName: "Acme Research",
      websiteUrl: webUrl("https://acme.example/careers"),
      domain: "acme.example",
      locationId: null,
      notes: "Promising local-first team.",
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expectTypeOf(createCompanyCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<CompanyDto>>
    >();
  });

  it.each([
    [{ origin: "user_entered", canonicalName: "" }, "empty company name"],
    [{ origin: "user_entered", canonicalName: "x".repeat(513) }, "overlong company name"],
    [{ origin: "user_entered", canonicalName: "Acme\u0000" }, "company control character"],
    [
      {
        origin: "user_entered",
        canonicalName: "Acme",
        websiteUrl: "file:///private/company",
      },
      "unsafe URL",
    ],
    [
      { origin: "user_entered", canonicalName: "Acme", domain: "not a domain/path" },
      "invalid domain",
    ],
    [{ origin: "user_entered", canonicalName: "Acme", locationId: "bad" }, "location ID"],
    [
      { origin: "user_entered", canonicalName: "Acme", notes: "x".repeat(200_001) },
      "overlong notes",
    ],
    [{ canonicalName: "Acme" }, "missing manual origin"],
    [{ origin: "source_backed", canonicalName: "Acme" }, "unprovenanced source company"],
  ] as const)("rejects an invalid %s before company persistence", async (input, _label) => {
    const companyContacts = companyContactPort();
    const result = await operationsFor(companyContacts).createCompanyCommand.execute(
      input as never,
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(companyContacts.createCompany).not.toHaveBeenCalled();
  });

  it("creates a user-entered contact as confirmed without invented confidence or provenance", async () => {
    const companyContacts = companyContactPort();
    const { createContactCommand } = operationsFor(companyContacts);

    expect(createContactCommand).toMatchObject({
      kind: "command",
      name: "CreateContactCommand",
      transactional: true,
    });
    const result = await createContactCommand.execute(
      {
        origin: "user_entered",
        companyId: COMPANY_ID,
        name: "Avery Rivera",
        role: "Engineering manager",
        email: "avery@acme.example",
        notes: "Met at the local TypeScript meetup.",
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: manualContact() });
    expect(companyContacts.createContact).toHaveBeenCalledWith({
      contact: {
        id: CONTACT_ID,
        companyId: COMPANY_ID,
        name: "Avery Rivera",
        role: "Engineering manager",
        email: "avery@acme.example",
        phone: null,
        publicProfileUrl: null,
        confidence: null,
        userConfirmed: true,
        notes: "Met at the local TypeScript meetup.",
        archivedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      provenanceLinks: [],
    });
    expectTypeOf(createContactCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<ContactDto>>
    >();
  });

  it("requires and atomically links provenance for every populated source-backed field", async () => {
    const companyContacts = companyContactPort();
    vi.mocked(companyContacts.createContact).mockResolvedValueOnce(sourceContact());
    const hashContactValue = vi.fn(async (value: string) =>
      value === "Avery Rivera" ? "a".repeat(64) : "b".repeat(64),
    );
    let linkIndex = 0;
    const { createContactCommand } = createCompanyContactOperations({
      companyContacts,
      createCompanyId: () => COMPANY_ID,
      createContactId: () => CONTACT_ID,
      createContactProvenanceLinkId: () => CONTACT_LINK_IDS[linkIndex++]!,
      hashContactValue,
    });

    const result = await createContactCommand.execute(
      {
        origin: "source_backed",
        companyId: COMPANY_ID,
        name: "Avery Rivera",
        role: "Director of Engineering",
        confidence: 0.82,
        provenance: [
          { fieldName: "role", provenanceId: ROLE_PROVENANCE_ID },
          { fieldName: "name", provenanceId: PROVENANCE_ID },
        ],
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: sourceContact() });
    expect(hashContactValue.mock.calls).toEqual([["Avery Rivera"], ["Director of Engineering"]]);
    expect(companyContacts.createContact).toHaveBeenCalledWith({
      contact: {
        id: CONTACT_ID,
        companyId: COMPANY_ID,
        name: "Avery Rivera",
        role: "Director of Engineering",
        email: null,
        phone: null,
        publicProfileUrl: null,
        confidence: confidence(0.82),
        userConfirmed: false,
        notes: "",
        archivedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      provenanceLinks: [
        {
          id: CONTACT_LINK_IDS[0],
          contactId: CONTACT_ID,
          fieldName: "name",
          valueHash: "a".repeat(64),
          provenanceId: PROVENANCE_ID,
          createdAt: NOW,
        },
        {
          id: CONTACT_LINK_IDS[1],
          contactId: CONTACT_ID,
          fieldName: "role",
          valueHash: "b".repeat(64),
          provenanceId: ROLE_PROVENANCE_ID,
          createdAt: NOW,
        },
      ],
    });
  });

  it("keeps absent source-backed contact fields null instead of guessing them", async () => {
    const companyContacts = companyContactPort();
    vi.mocked(companyContacts.createContact).mockResolvedValueOnce({
      ...sourceContact(),
      role: null,
    });
    const { createContactCommand } = operationsFor(companyContacts);

    const result = await createContactCommand.execute(
      {
        origin: "source_backed",
        companyId: COMPANY_ID,
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      value: { role: null, email: null, phone: null, publicProfileUrl: null },
    });
    expect(companyContacts.createContact).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: expect.objectContaining({
          role: null,
          email: null,
          phone: null,
          publicProfileUrl: null,
        }),
      }),
    );
  });

  it.each([
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [],
      },
      "missing provenance",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [
          { fieldName: "name", provenanceId: PROVENANCE_ID },
          { fieldName: "email", provenanceId: PROVENANCE_ID },
        ],
      },
      "provenance for an absent value",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [
          { fieldName: "name", provenanceId: PROVENANCE_ID },
          { fieldName: "name", provenanceId: ROLE_PROVENANCE_ID },
        ],
      },
      "duplicate field provenance",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [{ fieldName: "unknown", provenanceId: PROVENANCE_ID }],
      },
      "unknown provenance field",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [{ fieldName: "name", provenanceId: "bad" }],
      },
      "invalid provenance ID",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      "missing confidence",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 1.01,
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      "invalid confidence",
    ],
    [
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        notes: "copied source text",
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      "unprovenanced source notes",
    ],
    [
      {
        origin: "user_entered",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      "source metadata on a manual contact",
    ],
  ] as const)("rejects %s without persisting a contact", async (input, _label) => {
    const companyContacts = companyContactPort();
    const result = await operationsFor(companyContacts).createContactCommand.execute(
      input as never,
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(companyContacts.createContact).not.toHaveBeenCalled();
  });

  it.each([
    [{ origin: "user_entered", name: "" }, "empty name"],
    [{ origin: "user_entered", name: "Avery", companyId: "bad" }, "company ID"],
    [{ origin: "user_entered", name: "Avery", role: "x".repeat(513) }, "role"],
    [{ origin: "user_entered", name: "Avery", email: "not-an-email" }, "email"],
    [{ origin: "user_entered", name: "Avery", phone: "  " }, "phone"],
    [
      { origin: "user_entered", name: "Avery", publicProfileUrl: "javascript:alert(1)" },
      "public profile URL",
    ],
    [{ origin: "user_entered", name: "Avery", notes: "unsafe\u0000notes" }, "notes"],
    [{ origin: "guessed", name: "Avery" }, "origin"],
  ] as const)("rejects an invalid contact %s", async (input, _label) => {
    const companyContacts = companyContactPort();
    const result = await operationsFor(companyContacts).createContactCommand.execute(
      input as never,
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(companyContacts.createContact).not.toHaveBeenCalled();
  });

  it("fails closed when hashing does not return a lowercase SHA-256", async () => {
    const companyContacts = companyContactPort();
    const operations = createCompanyContactOperations({
      companyContacts,
      createCompanyId: () => COMPANY_ID,
      createContactId: () => CONTACT_ID,
      createContactProvenanceLinkId: () => CONTACT_LINK_IDS[0],
      hashContactValue: async () => "private-source-value",
    });

    const result = await operations.createContactCommand.execute(
      {
        origin: "source_backed",
        name: "Avery Rivera",
        confidence: 0.82,
        provenance: [{ fieldName: "name", provenanceId: PROVENANCE_ID }],
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(companyContacts.createContact).not.toHaveBeenCalled();
  });

  it.each([
    ["already_exists", "conflict", "This local company or contact already exists.", false],
    ["company_not_found", "not_found", "The selected local company was not found.", false],
    ["provenance_not_found", "not_found", "Required local provenance was not found.", false],
    [
      "linkage_conflict",
      "conflict",
      "The contact and provenance records could not be linked safely.",
      false,
    ],
    ["busy", "conflict", "The local relationship store is busy. Retry shortly.", true],
    ["unavailable", "unavailable", "Local relationship storage is unavailable.", true],
    [
      "permission_denied",
      "permission_denied",
      "Coredrill cannot access local relationship storage.",
      true,
    ],
    ["read_only", "permission_denied", "The local relationship store is read-only.", false],
    ["invalid_state", "internal", "The local relationship store is not usable.", false],
  ] as const)(
    "maps the %s relationship failure to a stable content-free error",
    async (portCode, applicationCode, message, retryable) => {
      const companyContacts = companyContactPort();
      vi.mocked(companyContacts.createCompany).mockRejectedValueOnce(
        new CompanyContactError(portCode),
      );

      await expect(
        operationsFor(companyContacts).createCompanyCommand.execute(
          { origin: "user_entered", canonicalName: "Acme Research" },
          context,
        ),
      ).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("redacts unknown persistence failures", async () => {
    const companyContacts = companyContactPort();
    vi.mocked(companyContacts.createContact).mockRejectedValueOnce(
      new Error("C:\\Users\\Candidate\\private.sqlite contains personal contact data"),
    );

    const result = await operationsFor(companyContacts).createContactCommand.execute(
      { origin: "user_entered", name: "Avery Rivera" },
      context,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local company or contact operation failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("personal contact data");
  });

  it.each(["company", "contact"] as const)(
    "fails closed when the %s port result does not match the command",
    async (record) => {
      const companyContacts = companyContactPort();
      if (record === "company") {
        vi.mocked(companyContacts.createCompany).mockResolvedValueOnce({
          ...company(),
          id: entityId("company", "0198e203-1000-7000-8000-000000000099"),
        });
        await expect(
          operationsFor(companyContacts).createCompanyCommand.execute(
            {
              origin: "user_entered",
              canonicalName: company().canonicalName,
              websiteUrl: company().websiteUrl,
              domain: company().domain,
              notes: company().notes,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      } else {
        vi.mocked(companyContacts.createContact).mockResolvedValueOnce({
          ...manualContact(),
          userConfirmed: false,
        });
        await expect(
          operationsFor(companyContacts).createContactCommand.execute(
            {
              origin: "user_entered",
              companyId: COMPANY_ID,
              name: manualContact().name,
              role: manualContact().role,
              email: manualContact().email,
              notes: manualContact().notes,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      }
    },
  );

  it("rejects an adapter result that omits an explicit nullable contact field", async () => {
    const companyContacts = companyContactPort();
    const { phone: _omittedPhone, ...incompleteContact } = manualContact();
    expect(_omittedPhone).toBeNull();
    vi.mocked(companyContacts.createContact).mockResolvedValueOnce(incompleteContact as ContactDto);

    const result = await operationsFor(companyContacts).createContactCommand.execute(
      {
        origin: "user_entered",
        companyId: COMPANY_ID,
        name: manualContact().name,
        role: manualContact().role,
        email: manualContact().email,
        notes: manualContact().notes,
      },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
