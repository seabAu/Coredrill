import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DomainValidationError,
  STATUS_CATEGORIES,
  createCustomStatusStage,
  createStatusStage,
  createStatusTransition,
  evaluateStatusTransition,
  isStatusCategory,
  type StatusCategory,
} from "../src/index.js";

const firstId = "019539af-7c11-7dd4-8b54-395d8f3fe4c2";
const secondId = "019539af-7c12-7dd4-8b54-395d8f3fe4c2";

function stage(
  id: string,
  category: StatusCategory,
  name: string = category,
  terminal = false,
  sortOrder = 0,
) {
  return createCustomStatusStage({ id, name, category, sortOrder, terminal });
}

describe("semantic status categories and custom stages", () => {
  it("retains the ten accepted reporting categories", () => {
    expect(STATUS_CATEGORIES).toEqual([
      "viewed",
      "saved",
      "preparing",
      "applied",
      "response",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ]);
    expect(new Set(STATUS_CATEGORIES).size).toBe(STATUS_CATEGORIES.length);
  });

  it("maps every custom stage to exactly one semantic category", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_CATEGORIES),
        fc.nat({ max: 10_000 }),
        fc.boolean(),
        (category, order, terminal) => {
          const custom = createCustomStatusStage({
            id: firstId,
            name: `  Custom   ${category}  `,
            category,
            sortOrder: order,
            terminal,
          });
          expect(custom.category).toBe(category);
          expect(custom.name).toBe(`Custom ${category}`);
          expect(custom.isSystem).toBe(false);
          expect(custom.terminal).toBe(terminal);
          expect(Object.isFrozen(custom)).toBe(true);
        },
      ),
    );
  });

  it("can distinguish reviewed system definitions without changing category semantics", () => {
    const system = createStatusStage({
      id: firstId,
      name: "Saved",
      category: "saved",
      sortOrder: 1,
      terminal: false,
      isSystem: true,
    });
    expect(system.isSystem).toBe(true);
    expect(system.terminal).toBe(false);
  });

  it("rejects unmapped or unsafe custom stages", () => {
    for (const input of [
      { id: firstId, name: "Unknown", category: "unknown", sortOrder: 0, terminal: false },
      { id: firstId, name: " ", category: "saved", sortOrder: 0, terminal: false },
      { id: firstId, name: "Bad\nName", category: "saved", sortOrder: 0, terminal: false },
      { id: firstId, name: "Saved", category: "saved", sortOrder: -1, terminal: false },
      { id: firstId, name: "Saved", category: "saved", sortOrder: 1.5, terminal: false },
    ]) {
      expect(() => createCustomStatusStage(input)).toThrowError(
        expect.objectContaining({ code: "invalid_status_stage" }),
      );
    }
    expect(() =>
      createCustomStatusStage({
        id: "not-an-id",
        name: "Saved",
        category: "saved",
        sortOrder: 0,
        terminal: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_entity_id" }));
    expect(isStatusCategory("saved")).toBe(true);
    expect(isStatusCategory("closed")).toBe(false);
    expect(isStatusCategory(1)).toBe(false);
  });
});

describe("status transition policy", () => {
  it("allows forward, backward, and same-category moves between distinct active stages", () => {
    expect(createStatusTransition(stage(firstId, "saved"), stage(secondId, "preparing")).kind).toBe(
      "move",
    );
    expect(createStatusTransition(stage(firstId, "preparing"), stage(secondId, "saved")).kind).toBe(
      "move",
    );
    expect(
      createStatusTransition(
        stage(firstId, "interview", "Phone screen"),
        stage(secondId, "interview", "Panel"),
      ).kind,
    ).toBe("move_within_category");
  });

  it("classifies closing and closed-outcome correction while protecting reopen", () => {
    expect(
      createStatusTransition(stage(firstId, "offer"), stage(secondId, "rejected", "Rejected", true))
        .kind,
    ).toBe("close");
    expect(
      createStatusTransition(
        stage(firstId, "rejected", "Rejected", true),
        stage(secondId, "withdrawn", "Withdrawn", true),
      ).kind,
    ).toBe("change_closed_outcome");

    const blocked = evaluateStatusTransition(
      stage(firstId, "rejected", "Rejected", true),
      stage(secondId, "preparing"),
    );
    expect(blocked).toEqual({
      allowed: false,
      reason: "reopen_requires_explicit_confirmation",
    });
    expect(() =>
      createStatusTransition(
        stage(firstId, "rejected", "Rejected", true),
        stage(secondId, "preparing"),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_status_transition" }));
    expect(
      createStatusTransition(
        stage(firstId, "rejected", "Rejected", true),
        stage(secondId, "preparing"),
        { allowReopen: true },
      ).kind,
    ).toBe("reopen");
  });

  it("rejects no-op moves even if callers reconstruct the same stage", () => {
    const from = stage(firstId, "saved");
    expect(evaluateStatusTransition(from, stage(firstId, "saved"))).toEqual({
      allowed: false,
      reason: "same_stage",
    });
    expect(() => createStatusTransition(from, stage(firstId, "saved"))).toThrow(
      DomainValidationError,
    );
  });

  it("applies the terminal-exit rule for every accepted category pair", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUS_CATEGORIES),
        fc.constantFrom(...STATUS_CATEGORIES),
        (fromCategory, toCategory) => {
          const from = stage(firstId, fromCategory, fromCategory, fromCategory === "archived");
          const to = stage(secondId, toCategory, toCategory, toCategory === "archived");
          const decision = evaluateStatusTransition(from, to);
          const shouldBlock = from.terminal && !to.terminal;
          expect(decision.allowed).toBe(!shouldBlock);
          expect(evaluateStatusTransition(from, to, { allowReopen: true }).allowed).toBe(true);
        },
      ),
    );
  });
});
