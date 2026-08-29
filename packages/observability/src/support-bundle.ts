import {
  SUPPORT_BUNDLE_SPEC_VERSION,
  diagnosticEventV1Schema,
  supportBundleV1Schema,
  type DiagnosticEventV1,
  type SupportBundleV1,
} from "@coredrill/contracts";

export interface UserCopyableSupportBundle {
  readonly bundle: SupportBundleV1;
  readonly copyText: string;
}

export interface SupportBundleInput {
  readonly generatedAt: string;
  readonly appVersion: string;
  readonly events: readonly unknown[];
}

const copyDiagnosticEvent = (value: unknown): DiagnosticEventV1 => {
  const parsed = diagnosticEventV1Schema.parse(value);
  return Object.freeze({
    ...parsed,
    attributes: Object.freeze({ ...parsed.attributes }),
  });
};

const compareNewestFirst = (left: DiagnosticEventV1, right: DiagnosticEventV1): number => {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt > right.occurredAt ? -1 : 1;
  }
  if (left.eventId === right.eventId) return 0;
  return left.eventId > right.eventId ? -1 : 1;
};

export const createUserCopyableSupportBundle = (
  input: SupportBundleInput,
): UserCopyableSupportBundle => {
  const events = input.events.map(copyDiagnosticEvent).sort(compareNewestFirst);
  const parsed = supportBundleV1Schema.parse({
    specVersion: SUPPORT_BUNDLE_SPEC_VERSION,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    delivery: "local-copy",
    eventOrder: "newest-first",
    events,
  });
  const bundle = Object.freeze({
    ...parsed,
    events: Object.freeze([...parsed.events]),
  }) as unknown as SupportBundleV1;
  return Object.freeze({
    bundle,
    copyText: `${JSON.stringify(bundle, undefined, 2)}\n`,
  });
};
