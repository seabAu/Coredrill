import {
  diagnosticAttributeKeySchema,
  diagnosticAttributeValueSchema,
  diagnosticEventV1Schema,
  type DiagnosticAttributeValue,
  type DiagnosticEventV1,
} from "@coredrill/contracts";

export interface DiagnosticRedactionResult {
  readonly attributes: Readonly<Record<string, DiagnosticAttributeValue>>;
  readonly redactedAttributeCount: number;
}

export type LocalDiagnosticEventInput = Omit<
  DiagnosticEventV1,
  "attributes" | "redactedAttributeCount"
>;

export const redactDiagnosticAttributes = (
  input: Readonly<Record<string, unknown>>,
): DiagnosticRedactionResult => {
  const accepted: (readonly [string, DiagnosticAttributeValue])[] = [];
  let redactedAttributeCount = 0;

  for (const [key, value] of Object.entries(input).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const parsedKey = diagnosticAttributeKeySchema.safeParse(key);
    const parsedValue = diagnosticAttributeValueSchema.safeParse(value);
    if (!parsedKey.success || !parsedValue.success || accepted.length >= 32) {
      redactedAttributeCount += 1;
      continue;
    }
    accepted.push([parsedKey.data, parsedValue.data]);
  }

  return Object.freeze({
    attributes: Object.freeze(Object.fromEntries(accepted)),
    redactedAttributeCount,
  });
};

export const createLocalDiagnosticEvent = (
  input: LocalDiagnosticEventInput,
  rawAttributes: Readonly<Record<string, unknown>>,
): DiagnosticEventV1 => {
  const redacted = redactDiagnosticAttributes(rawAttributes);
  const event = diagnosticEventV1Schema.parse({ ...input, ...redacted });
  return Object.freeze({ ...event, attributes: Object.freeze(event.attributes) });
};
