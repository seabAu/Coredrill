import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";
import { entityId, type EntityId } from "./identifiers.js";
import { hasControlCharacters } from "./text.js";

const SOURCE_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export type SourceType<TSource extends string = string> = Brand<TSource, "source-type">;

export interface SourceReference<TSource extends string = string> {
  readonly sourceType: SourceType<TSource>;
  readonly sourceId: EntityId<TSource>;
  readonly pointer?: string;
}

function sourceType<TSource extends string>(value: TSource): SourceType<TSource> {
  if (!SOURCE_TYPE_PATTERN.test(value) || value.length > 64) {
    throw new DomainValidationError(
      "invalid_source_reference",
      "Source type must be a lowercase identifier of at most 64 characters.",
    );
  }
  return value as SourceType<TSource>;
}

/** Create an opaque durable source reference; provenance details remain separate. */
export function sourceReference<TSource extends string>(input: {
  readonly sourceType: TSource;
  readonly sourceId: string;
  readonly pointer?: string;
}): SourceReference<TSource> {
  const type = sourceType(input.sourceType);
  if (
    input.pointer !== undefined &&
    (input.pointer.length === 0 ||
      input.pointer.length > 2048 ||
      input.pointer !== input.pointer.trim() ||
      hasControlCharacters(input.pointer))
  ) {
    throw new DomainValidationError(
      "invalid_source_reference",
      "Source pointer must be nonempty, trimmed, content-free location text.",
    );
  }

  const reference = {
    sourceType: type,
    sourceId: entityId(input.sourceType, input.sourceId),
    ...(input.pointer === undefined ? {} : { pointer: input.pointer }),
  };
  return Object.freeze(reference);
}
