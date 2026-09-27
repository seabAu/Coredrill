import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  CareerProfileError,
  createCareerProfileOperations,
  validateManualCareerProfileEntry,
  type CareerProfileEntryDto,
  type CareerProfilePort,
  type CreateManualCareerProfilePortInput,
  type ManualCareerProfileKind,
} from "../src/index.js";

const CREATED_AT = instant("2026-09-27T12:00:00.000Z");
const IDS = Object.freeze({
  basics: "0199a100-0000-7000-8000-000000000001",
  employment: "0199a100-0000-7000-8000-000000000002",
  education: "0199a100-0000-7000-8000-000000000003",
  project: "0199a100-0000-7000-8000-000000000004",
  skill: "0199a100-0000-7000-8000-000000000005",
  accomplishment: "0199a100-0000-7000-8000-000000000006",
  certification: "0199a100-0000-7000-8000-000000000007",
  publication: "0199a100-0000-7000-8000-000000000008",
  volunteer: "0199a100-0000-7000-8000-000000000009",
} as const satisfies Readonly<Record<ManualCareerProfileKind, string>>);

const entry = (input: CreateManualCareerProfilePortInput): CareerProfileEntryDto =>
  Object.freeze({
    id: input.id,
    kind: input.kind,
    primaryLabel:
      input.kind === "basics"
        ? input.displayName
        : input.kind === "employment" || input.kind === "volunteer"
          ? input.role
          : input.kind === "education"
            ? input.credential
            : input.kind === "project"
              ? input.name
              : input.kind === "skill"
                ? input.canonicalName
                : input.kind === "accomplishment"
                  ? input.action
                  : input.kind === "certification"
                    ? input.name
                    : input.title,
    secondaryLabel:
      input.kind === "employment" || input.kind === "volunteer"
        ? input.organization
        : input.kind === "education"
          ? input.institution
          : input.kind === "certification"
            ? input.issuer
            : null,
    startDate:
      "startDate" in input
        ? input.startDate
        : input.kind === "certification"
          ? input.issuedDate
          : input.kind === "publication"
            ? input.publishedDate
            : null,
    endDate:
      "endDate" in input
        ? input.endDate
        : input.kind === "certification"
          ? input.expiresDate
          : null,
    current: "current" in input ? input.current : false,
    verificationState: input.kind === "basics" || input.kind === "skill" ? null : "user_confirmed",
    createdAt: input.createdAt,
    rowVersion: 1,
  });

const setup = () => {
  const stored: CreateManualCareerProfilePortInput[] = [];
  const port: CareerProfilePort = {
    createManualEntry: vi.fn(async (input) => {
      stored.push(input);
      return entry(input);
    }),
    listManualEntries: vi.fn(async () => Object.freeze(stored.map(entry))),
  };
  const operations = createCareerProfileOperations({
    careerProfile: port,
    createId: (kind) => IDS[kind],
  });
  return { operations, port, stored };
};

const context = Object.freeze({
  operationId: entityId("application-operation", "0199a100-0000-7000-8000-000000000099"),
  initiatedAt: CREATED_AT,
});

describe("Career Profile application boundary", () => {
  it("creates manual employment as source-free, user-confirmed local evidence", async () => {
    const { operations, stored } = setup();
    const result = await operations.createManualEntryCommand.execute(
      {
        kind: "employment",
        organization: "  Northstar Health  ",
        role: " Operations Lead ",
        startDate: "2024-02-29",
        current: true,
        description: " Built a local operating cadence. ",
      },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      value: { kind: "employment", primaryLabel: "Operations Lead" },
    });
    expect(stored).toEqual([
      expect.objectContaining({
        id: IDS.employment,
        organization: "Northstar Health",
        role: "Operations Lead",
        startDate: "2024-02-29",
        endDate: null,
        current: true,
        sourceDocumentId: null,
        verificationState: "user_confirmed",
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      }),
    ]);
  });

  it("rejects impossible, inverted, and current-with-end-date ranges before persistence", async () => {
    const { operations, port } = setup();
    for (const input of [
      { kind: "employment", organization: "A", role: "B", startDate: "2026-02-29" },
      {
        kind: "education",
        institution: "A",
        credential: "B",
        startDate: "2026-05-02",
        endDate: "2026-05-01",
      },
      {
        kind: "volunteer",
        organization: "A",
        role: "B",
        current: true,
        endDate: "2026-05-01",
      },
    ] as const) {
      const result = await operations.createManualEntryCommand.execute(input, context);
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    }
    expect(port.createManualEntry).not.toHaveBeenCalled();
  });

  it("returns field-specific date, range, URL, list, and required-value issues", () => {
    expect(
      validateManualCareerProfileEntry({
        kind: "certification",
        name: " ",
        issuer: "Issuer",
        issuedDate: "2026-08-02",
        expiresDate: "2026-08-01",
        credentialUrl: "https://user:secret@example.test/credential",
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { field: "name", message: "Enter a value." },
        { field: "expiresDate", message: "Expiration date cannot be earlier than issue date." },
        {
          field: "credentialUrl",
          message: "Use an absolute HTTP(S) URL without credentials.",
        },
      ]),
    });
    expect(validateManualCareerProfileEntry({ kind: "missing" })).toMatchObject({
      ok: false,
      issues: [{ field: "kind" }],
    });
    expect(
      validateManualCareerProfileEntry({
        kind: "skill",
        canonicalName: "TypeScript",
        aliases: ["TS", "ts"],
      }),
    ).toMatchObject({ ok: false, issues: [{ field: "aliases" }] });
  });

  it("normalizes and creates every supported manual editor kind", async () => {
    const { operations, stored } = setup();
    const inputs = [
      {
        kind: "basics",
        displayName: "Sean",
        targetRoles: ["Engineer"],
        workModes: ["remote"],
      },
      { kind: "education", institution: "State University", credential: "BS", field: "CS" },
      { kind: "project", name: "Coredrill", url: "https://example.test/project" },
      {
        kind: "skill",
        canonicalName: "TypeScript",
        category: "Languages",
        aliases: ["TS"],
      },
      {
        kind: "accomplishment",
        action: "Automated review",
        result: "Cut review time by 30%",
      },
      {
        kind: "certification",
        name: "Security",
        issuer: "Example",
        issuedDate: "2025-01-01",
      },
      {
        kind: "publication",
        title: "Local-first systems",
        publisher: "Example",
        publishedDate: "2025-02-01",
      },
      {
        kind: "volunteer",
        organization: "Guild",
        role: "Mentor",
        startDate: "2023-01-01",
      },
    ] as const;
    for (const input of inputs) {
      const result = await operations.createManualEntryCommand.execute(input, context);
      expect(result.ok).toBe(true);
    }
    expect(stored.map(({ kind }) => kind)).toEqual(inputs.map(({ kind }) => kind));
    expect(
      stored
        .filter((value) => value.kind !== "basics" && value.kind !== "skill")
        .every(
          (value) => "verificationState" in value && value.verificationState === "user_confirmed",
        ),
    ).toBe(true);
  });

  it("lists copied unique entries and fails closed on duplicate port output", async () => {
    const { operations } = setup();
    await operations.createManualEntryCommand.execute(
      { kind: "skill", canonicalName: "TypeScript" },
      context,
    );
    const listed = await operations.listManualEntriesQuery.execute(undefined, context);
    expect(listed).toMatchObject({
      ok: true,
      value: [{ kind: "skill", primaryLabel: "TypeScript" }],
    });
    expect(Object.isFrozen(listed.ok ? listed.value : null)).toBe(true);

    const duplicate = entry({
      kind: "skill",
      id: entityId("skill", IDS.skill),
      canonicalName: "TypeScript",
      category: null,
      aliases: [],
      archivedAt: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });
    const invalidOperations = createCareerProfileOperations({
      careerProfile: {
        createManualEntry: async () => duplicate,
        listManualEntries: async () => [duplicate, duplicate],
      },
      createId: (kind) => IDS[kind],
    });
    await expect(
      invalidOperations.listManualEntriesQuery.execute(undefined, context),
    ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
  });

  it("maps stable port failures and rejects incomplete dependencies", async () => {
    const operations = createCareerProfileOperations({
      careerProfile: {
        createManualEntry: async () => {
          throw new CareerProfileError("already_exists");
        },
        listManualEntries: async () => {
          throw new CareerProfileError("busy");
        },
      },
      createId: (kind) => IDS[kind],
    });
    await expect(
      operations.createManualEntryCommand.execute(
        { kind: "skill", canonicalName: "TypeScript" },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict", retryable: false } });
    await expect(
      operations.listManualEntriesQuery.execute(undefined, context),
    ).resolves.toMatchObject({ ok: false, error: { code: "conflict", retryable: true } });
    expect(() => createCareerProfileOperations({} as never)).toThrowError(
      "Career Profile operations require a complete local persistence port.",
    );
    expect(() => new CareerProfileError("unknown" as never)).toThrowError(
      "Career Profile failures require a reviewed stable code.",
    );
  });
});
