import * as z from "zod";

import { diagnosticEventV1Schema } from "./diagnostic-event.js";
import { instantSchema, semanticVersionSchema } from "./primitives.js";

export const SUPPORT_BUNDLE_SPEC_VERSION = 1 as const;
export const SUPPORT_BUNDLE_V1_SCHEMA_ID =
  "https://schemas.coredrill.local/support-bundle/v1.json" as const;
export const SUPPORT_BUNDLE_LIMITS = Object.freeze({ maxEvents: 200 });

export const supportBundleV1Schema = z
  .strictObject({
    specVersion: z.literal(SUPPORT_BUNDLE_SPEC_VERSION),
    generatedAt: instantSchema,
    appVersion: semanticVersionSchema,
    delivery: z.literal("local-copy"),
    eventOrder: z.literal("newest-first"),
    events: z.array(diagnosticEventV1Schema).max(SUPPORT_BUNDLE_LIMITS.maxEvents),
  })
  .superRefine((bundle, context) => {
    const eventIds = bundle.events.map(({ eventId }) => eventId);
    if (new Set(eventIds).size !== eventIds.length) {
      context.addIssue({
        code: "custom",
        message: "Support-bundle event identities must be unique.",
        path: ["events"],
      });
    }

    const newestFirst = bundle.events.every((event, index) => {
      const previous = bundle.events[index - 1];
      if (previous === undefined) return true;
      if (previous.occurredAt !== event.occurredAt) {
        return previous.occurredAt > event.occurredAt;
      }
      return previous.eventId > event.eventId;
    });
    if (!newestFirst) {
      context.addIssue({
        code: "custom",
        message: "Support-bundle events must use deterministic newest-first order.",
        path: ["events"],
      });
    }
  })
  .meta({
    title: "Coredrill SupportBundleV1",
    description:
      "Bounded user-copyable local support export containing only validated content-free diagnostic events.",
  });

const generatedSupportBundleV1JsonSchema = z.toJSONSchema(supportBundleV1Schema, {
  target: "draft-2020-12",
});
const { $schema: supportBundleDialect, ...supportBundleSchemaBody } =
  generatedSupportBundleV1JsonSchema;

export const supportBundleV1JsonSchema = Object.freeze({
  $schema: supportBundleDialect,
  $id: SUPPORT_BUNDLE_V1_SCHEMA_ID,
  ...supportBundleSchemaBody,
});

export type SupportBundleV1 = z.infer<typeof supportBundleV1Schema>;
