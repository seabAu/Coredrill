import type { EntityId, Instant } from "@coredrill/domain";

import type { ApplicationResult } from "./result.js";

export type ApplicationCommandName = `${string}Command`;
export type ApplicationQueryName = `${string}Query`;

export interface ApplicationOperationContext {
  readonly operationId: EntityId<"application-operation">;
  readonly initiatedAt: Instant;
}

export interface ApplicationCommand<Input, Output> {
  readonly kind: "command";
  readonly name: ApplicationCommandName;
  readonly transactional: true;
  readonly execute: (
    input: Input,
    context: ApplicationOperationContext,
  ) => Promise<ApplicationResult<Output>>;
}

export interface ApplicationQuery<Input, ViewDto> {
  readonly kind: "query";
  readonly name: ApplicationQueryName;
  readonly readOnly: true;
  readonly execute: (
    input: Input,
    context: ApplicationOperationContext,
  ) => Promise<ApplicationResult<ViewDto>>;
}

const OPERATION_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*(?:Command|Query)$/;

const assertOperationName = (name: string, suffix: "Command" | "Query"): void => {
  if (!OPERATION_NAME_PATTERN.test(name) || !name.endsWith(suffix) || name.length > 128) {
    throw new TypeError(
      `Application ${suffix.toLowerCase()} names must be PascalCase, end in ${suffix}, and contain at most 128 characters.`,
    );
  }
};

export const defineCommand = <Input, Output>(
  name: ApplicationCommandName,
  execute: ApplicationCommand<Input, Output>["execute"],
): ApplicationCommand<Input, Output> => {
  assertOperationName(name, "Command");
  return Object.freeze({ kind: "command", name, transactional: true, execute });
};

export const defineQuery = <Input, ViewDto>(
  name: ApplicationQueryName,
  execute: ApplicationQuery<Input, ViewDto>["execute"],
): ApplicationQuery<Input, ViewDto> => {
  assertOperationName(name, "Query");
  return Object.freeze({ kind: "query", name, readOnly: true, execute });
};
