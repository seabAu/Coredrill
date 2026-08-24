import { DomainValidationError } from "./errors.js";
import { entityId, type EntityId } from "./identifiers.js";
import { hasControlCharacters } from "./text.js";

export const STATUS_CATEGORIES = [
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
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];
export type StatusDefinitionId = EntityId<"status_definition">;

export interface StatusStage {
  readonly id: StatusDefinitionId;
  readonly name: string;
  readonly category: StatusCategory;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly terminal: boolean;
}

export interface StatusStageInput {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly sortOrder: number;
  readonly terminal: boolean;
  readonly isSystem?: boolean;
}

const statusCategorySet = new Set<string>(STATUS_CATEGORIES);

export function isStatusCategory(value: unknown): value is StatusCategory {
  return typeof value === "string" && statusCategorySet.has(value);
}

export function createStatusStage(input: StatusStageInput): StatusStage {
  const normalizedName = input.name.trim().replace(/\s+/g, " ");
  if (
    normalizedName.length === 0 ||
    normalizedName.length > 80 ||
    hasControlCharacters(input.name) ||
    !isStatusCategory(input.category) ||
    !Number.isSafeInteger(input.sortOrder) ||
    input.sortOrder < 0 ||
    typeof input.terminal !== "boolean"
  ) {
    throw new DomainValidationError(
      "invalid_status_stage",
      "Stage requires a safe name, semantic category, and nonnegative integer order.",
    );
  }

  return Object.freeze({
    id: entityId("status_definition", input.id),
    name: normalizedName,
    category: input.category,
    sortOrder: input.sortOrder,
    isSystem: input.isSystem ?? false,
    terminal: input.terminal,
  });
}

export function createCustomStatusStage(input: Omit<StatusStageInput, "isSystem">): StatusStage {
  return createStatusStage({ ...input, isSystem: false });
}

export type StatusTransitionKind =
  "move" | "move_within_category" | "close" | "change_closed_outcome" | "reopen";

export interface StatusTransition {
  readonly fromStatusId: StatusDefinitionId;
  readonly toStatusId: StatusDefinitionId;
  readonly fromCategory: StatusCategory;
  readonly toCategory: StatusCategory;
  readonly kind: StatusTransitionKind;
}

export type StatusTransitionDecision =
  | { readonly allowed: true; readonly transition: StatusTransition }
  | {
      readonly allowed: false;
      readonly reason: "same_stage" | "reopen_requires_explicit_confirmation";
    };

export interface StatusTransitionOptions {
  readonly allowReopen?: boolean;
}

export function evaluateStatusTransition(
  from: StatusStage,
  to: StatusStage,
  options: StatusTransitionOptions = {},
): StatusTransitionDecision {
  if (from.id === to.id) {
    return Object.freeze({ allowed: false, reason: "same_stage" });
  }
  if (from.terminal && !to.terminal && options.allowReopen !== true) {
    return Object.freeze({
      allowed: false,
      reason: "reopen_requires_explicit_confirmation",
    });
  }

  const kind: StatusTransitionKind =
    from.terminal && !to.terminal
      ? "reopen"
      : from.terminal && to.terminal
        ? "change_closed_outcome"
        : !from.terminal && to.terminal
          ? "close"
          : from.category === to.category
            ? "move_within_category"
            : "move";

  return Object.freeze({
    allowed: true,
    transition: Object.freeze({
      fromStatusId: from.id,
      toStatusId: to.id,
      fromCategory: from.category,
      toCategory: to.category,
      kind,
    }),
  });
}

export function createStatusTransition(
  from: StatusStage,
  to: StatusStage,
  options: StatusTransitionOptions = {},
): StatusTransition {
  const decision = evaluateStatusTransition(from, to, options);
  if (!decision.allowed) {
    throw new DomainValidationError(
      "invalid_status_transition",
      decision.reason === "same_stage"
        ? "A status transition must change the stage."
        : "Leaving a terminal stage requires explicit reopen confirmation.",
    );
  }
  return decision.transition;
}
