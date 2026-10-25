import {
  entityId,
  instant,
  timeZone,
  type EntityId,
  type Instant,
  type TimeZone,
} from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface NetworkReminderScopeV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly includeArchivedJobs: boolean;
}
export interface NetworkReminderV1 {
  readonly id: EntityId<"reminder">;
  readonly state: "pending";
  readonly remindAt: Instant;
  readonly timeZone: TimeZone;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
  readonly currentJob: {
    readonly id: EntityId<"job">;
    readonly title: string;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
    readonly company: {
      readonly id: EntityId<"company">;
      readonly name: string;
      readonly archivedAt: Instant | null;
      readonly rowVersion: number;
    } | null;
  };
  readonly nextAction: {
    readonly id: EntityId<"next-action">;
    readonly jobId: EntityId<"job">;
    readonly title: string;
    readonly state: "pending" | "completed" | "dismissed";
    readonly dueAt: Instant | null;
    readonly timeZone: TimeZone | null;
    readonly rowVersion: number;
  } | null;
  readonly interview: {
    readonly id: EntityId<"interview">;
    readonly stageName: string;
    readonly startsAt: Instant;
    readonly timeZone: TimeZone;
    readonly durationMinutes: number;
    readonly rowVersion: number;
    readonly application: {
      readonly id: EntityId<"application">;
      readonly jobId: EntityId<"job">;
      readonly archivedAt: Instant | null;
      readonly rowVersion: number;
    };
  } | null;
}
export interface NetworkReminderReferenceV1 extends NetworkReminderScopeV1 {
  readonly id: EntityId<"reminder">;
  readonly remindAt: Instant;
  readonly rowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
  readonly companyId: EntityId<"company"> | null;
  readonly companyRowVersion: number | null;
  readonly nextActionId: EntityId<"next-action"> | null;
  readonly nextActionRowVersion: number | null;
  readonly interviewId: EntityId<"interview"> | null;
  readonly interviewRowVersion: number | null;
  readonly interviewApplicationId: EntityId<"application"> | null;
  readonly interviewApplicationRowVersion: number | null;
}
export interface ListNetworkRemindersInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: NetworkReminderReferenceV1 | null;
}
export interface ListNetworkRemindersRequestV1 extends NetworkReminderScopeV1 {
  readonly limit: number;
  readonly after: NetworkReminderReferenceV1 | null;
}
export interface NetworkRemindersPageV1 extends NetworkReminderScopeV1 {
  readonly items: readonly NetworkReminderV1[];
  readonly hasMore: boolean;
  readonly nextCursor: NetworkReminderReferenceV1 | null;
}
export interface NetworkRemindersPortV1 {
  listPage(input: ListNetworkRemindersRequestV1): Promise<unknown>;
}
export class NetworkRemindersError extends Error {
  public override readonly name = "NetworkRemindersError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local pending reminders could not be read.");
    if (!["stale", "invalid_state", "unavailable"].includes(code)) throw new TypeError();
  }
}
const scopeKeys = ["specVersion", "expectedVaultId", "includeArchivedJobs"] as const;
const refKeys = [
  "id",
  "remindAt",
  "rowVersion",
  "jobId",
  "jobRowVersion",
  "companyId",
  "companyRowVersion",
  "nextActionId",
  "nextActionRowVersion",
  "interviewId",
  "interviewRowVersion",
  "interviewApplicationId",
  "interviewApplicationRowVersion",
] as const;
const record = (value: unknown, allowed: readonly string[], required = allowed) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    throw new TypeError();
  const copy: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
    copy[key] = descriptor.value;
  }
  return copy;
};
const text = (value: unknown, max: number, nonempty = false): string => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\uD800-\uDFFF]/u.test(value) ||
    (nonempty && value.trim().length === 0)
  )
    throw new TypeError();
  return value;
};
const integer = (value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new TypeError();
  return value;
};
const boolean = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const time = (value: unknown) => instant(text(value, 24));
const nullableTime = (value: unknown) => (value === null ? null : time(value));
const zone = (value: unknown) => timeZone(text(value, 128, true));
const pair = <K extends string>(kind: K, id: unknown, version: unknown) => {
  if (id === null && version === null) return null;
  return Object.freeze({ id: entityId(kind, text(id, 36)), rowVersion: integer(version) });
};
const scope = (raw: Record<string, unknown>, defaults = false): NetworkReminderScopeV1 => {
  if (raw["specVersion"] !== 1) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    expectedVaultId: entityId("vault", text(raw["expectedVaultId"], 36)),
    includeArchivedJobs:
      defaults && raw["includeArchivedJobs"] === undefined
        ? false
        : boolean(raw["includeArchivedJobs"]),
  });
};
const same = (a: NetworkReminderScopeV1, b: NetworkReminderScopeV1) =>
  a.expectedVaultId === b.expectedVaultId && a.includeArchivedJobs === b.includeArchivedJobs;
export const parseNetworkReminderReferenceV1 = (value: unknown): NetworkReminderReferenceV1 => {
  const raw = record(value, [...scopeKeys, ...refKeys]);
  const company = pair("company", raw["companyId"], raw["companyRowVersion"]),
    task = pair("next-action", raw["nextActionId"], raw["nextActionRowVersion"]),
    interview = pair("interview", raw["interviewId"], raw["interviewRowVersion"]),
    application = pair(
      "application",
      raw["interviewApplicationId"],
      raw["interviewApplicationRowVersion"],
    );
  if ((interview === null) !== (application === null)) throw new TypeError();
  return Object.freeze({
    ...scope(raw),
    id: entityId("reminder", text(raw["id"], 36)),
    remindAt: time(raw["remindAt"]),
    rowVersion: integer(raw["rowVersion"]),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobRowVersion: integer(raw["jobRowVersion"]),
    companyId: company?.id ?? null,
    companyRowVersion: company?.rowVersion ?? null,
    nextActionId: task?.id ?? null,
    nextActionRowVersion: task?.rowVersion ?? null,
    interviewId: interview?.id ?? null,
    interviewRowVersion: interview?.rowVersion ?? null,
    interviewApplicationId: application?.id ?? null,
    interviewApplicationRowVersion: application?.rowVersion ?? null,
  });
};
export const parseNetworkRemindersRequestV1 = (value: unknown): ListNetworkRemindersRequestV1 => {
  const raw = record(value, [...scopeKeys, "limit", "after"], ["specVersion", "expectedVaultId"]),
    owner = scope(raw, true);
  const after =
    raw["after"] === undefined || raw["after"] === null
      ? null
      : parseNetworkReminderReferenceV1(raw["after"]);
  if (after !== null && !same(owner, after)) throw new TypeError();
  return Object.freeze({
    ...owner,
    limit: raw["limit"] === undefined ? 10 : integer(raw["limit"], 1, 25),
    after,
  });
};
export const parseNetworkReminderV1 = (
  value: unknown,
  owner: NetworkReminderScopeV1,
): NetworkReminderV1 => {
  const raw = record(value, [
    "id",
    "state",
    "remindAt",
    "timeZone",
    "createdAt",
    "updatedAt",
    "rowVersion",
    "currentJob",
    "nextAction",
    "interview",
  ]);
  if (raw["state"] !== "pending") throw new TypeError();
  const j = record(raw["currentJob"], ["id", "title", "archivedAt", "rowVersion", "company"]);
  const company =
    j["company"] === null
      ? null
      : (() => {
          const c = record(j["company"], ["id", "name", "archivedAt", "rowVersion"]);
          return Object.freeze({
            id: entityId("company", text(c["id"], 36)),
            name: text(c["name"], 512, true),
            archivedAt: nullableTime(c["archivedAt"]),
            rowVersion: integer(c["rowVersion"]),
          });
        })();
  const currentJob = Object.freeze({
    id: entityId("job", text(j["id"], 36)),
    title: text(j["title"], 1024, true),
    archivedAt: nullableTime(j["archivedAt"]),
    rowVersion: integer(j["rowVersion"]),
    company,
  });
  if (!owner.includeArchivedJobs && currentJob.archivedAt !== null) throw new TypeError();
  const nextAction =
    raw["nextAction"] === null
      ? null
      : (() => {
          const t = record(raw["nextAction"], [
              "id",
              "jobId",
              "title",
              "state",
              "dueAt",
              "timeZone",
              "rowVersion",
            ]),
            state = t["state"];
          if (state !== "pending" && state !== "completed" && state !== "dismissed")
            throw new TypeError();
          const dueAt = nullableTime(t["dueAt"]),
            timeZone = t["timeZone"] === null ? null : zone(t["timeZone"]);
          if ((dueAt === null) !== (timeZone === null)) throw new TypeError();
          return Object.freeze({
            id: entityId("next-action", text(t["id"], 36)),
            jobId: entityId("job", text(t["jobId"], 36)),
            title: text(t["title"], 512, true),
            state,
            dueAt,
            timeZone,
            rowVersion: integer(t["rowVersion"]),
          });
        })();
  const interview =
    raw["interview"] === null
      ? null
      : (() => {
          const i = record(raw["interview"], [
              "id",
              "stageName",
              "startsAt",
              "timeZone",
              "durationMinutes",
              "rowVersion",
              "application",
            ]),
            a = record(i["application"], ["id", "jobId", "archivedAt", "rowVersion"]);
          return Object.freeze({
            id: entityId("interview", text(i["id"], 36)),
            stageName: text(i["stageName"], 256, true),
            startsAt: time(i["startsAt"]),
            timeZone: zone(i["timeZone"]),
            durationMinutes: integer(i["durationMinutes"], 1, 1440),
            rowVersion: integer(i["rowVersion"]),
            application: Object.freeze({
              id: entityId("application", text(a["id"], 36)),
              jobId: entityId("job", text(a["jobId"], 36)),
              archivedAt: nullableTime(a["archivedAt"]),
              rowVersion: integer(a["rowVersion"]),
            }),
          });
        })();
  const result = Object.freeze({
    id: entityId("reminder", text(raw["id"], 36)),
    state: "pending" as const,
    remindAt: time(raw["remindAt"]),
    timeZone: zone(raw["timeZone"]),
    createdAt: time(raw["createdAt"]),
    updatedAt: time(raw["updatedAt"]),
    rowVersion: integer(raw["rowVersion"]),
    currentJob,
    nextAction,
    interview,
  });
  if (
    result.createdAt > result.updatedAt ||
    (nextAction !== null && nextAction.jobId !== currentJob.id) ||
    (interview !== null && interview.application.jobId !== currentJob.id)
  )
    throw new TypeError();
  return result;
};
export const networkReminderReferenceV1 = (
  owner: NetworkReminderScopeV1,
  item: NetworkReminderV1,
): NetworkReminderReferenceV1 =>
  parseNetworkReminderReferenceV1({
    ...scope(
      record(owner, [...scopeKeys, "limit", "after", "items", "hasMore", "nextCursor"], scopeKeys),
    ),
    id: item.id,
    remindAt: item.remindAt,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
    companyId: item.currentJob.company?.id ?? null,
    companyRowVersion: item.currentJob.company?.rowVersion ?? null,
    nextActionId: item.nextAction?.id ?? null,
    nextActionRowVersion: item.nextAction?.rowVersion ?? null,
    interviewId: item.interview?.id ?? null,
    interviewRowVersion: item.interview?.rowVersion ?? null,
    interviewApplicationId: item.interview?.application.id ?? null,
    interviewApplicationRowVersion: item.interview?.application.rowVersion ?? null,
  });
export const compareNetworkReminders = (
  a: { readonly remindAt: Instant; readonly id: string },
  b: { readonly remindAt: Instant; readonly id: string },
) =>
  a.remindAt === b.remindAt
    ? a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0
    : a.remindAt < b.remindAt
      ? -1
      : 1;
export const validateNetworkReminderSequenceV1 = (
  items: readonly NetworkReminderV1[],
  after: NetworkReminderReferenceV1 | null,
) => {
  let previous: Pick<NetworkReminderV1, "id" | "remindAt"> | null = after;
  const seen = new Set<string>(),
    parents = new Map<string, string>();
  const coherent = (kind: string, value: { readonly id: string } | null) => {
    if (value === null) return;
    const key = `${kind}:${value.id}`,
      encoded = JSON.stringify(value),
      prior = parents.get(key);
    if (prior !== undefined && prior !== encoded) throw new TypeError();
    parents.set(key, encoded);
  };
  for (const item of items) {
    if (seen.has(item.id) || (previous !== null && compareNetworkReminders(previous, item) >= 0))
      throw new TypeError();
    coherent("job", item.currentJob);
    coherent("company", item.currentJob.company);
    coherent("task", item.nextAction);
    coherent("interview", item.interview);
    coherent("application", item.interview?.application ?? null);
    seen.add(item.id);
    previous = item;
  }
};
export const parseNetworkRemindersPageV1 = (
  value: unknown,
  input: ListNetworkRemindersRequestV1,
): NetworkRemindersPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]),
    owner = scope(raw);
  if (!same(owner, input) || !Array.isArray(raw["items"]) || raw["items"].length > input.limit)
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseNetworkReminderV1(item, owner));
  validateNetworkReminderSequenceV1(items, input.after);
  const hasMore = boolean(raw["hasMore"]),
    nextCursor =
      raw["nextCursor"] === null ? null : parseNetworkReminderReferenceV1(raw["nextCursor"]),
    last = items.at(-1);
  if (
    hasMore
      ? items.length !== input.limit ||
        last === undefined ||
        nextCursor === null ||
        JSON.stringify(nextCursor) !== JSON.stringify(networkReminderReferenceV1(owner, last))
      : nextCursor !== null
  )
    throw new TypeError();
  return Object.freeze({ ...owner, items: Object.freeze(items), hasMore, nextCursor });
};
export const createNetworkRemindersQuery = (port: NetworkRemindersPortV1) =>
  defineQuery<ListNetworkRemindersInputV1, NetworkRemindersPageV1>(
    "ListNetworkRemindersQuery",
    async (value, context) => {
      let input: ListNetworkRemindersRequestV1;
      try {
        const c = record(context, ["operationId", "initiatedAt"]);
        entityId("application-operation", text(c["operationId"], 36));
        time(c["initiatedAt"]);
        input = parseNetworkRemindersRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed vault and pending-reminder page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        return applicationFailure({
          code:
            error instanceof NetworkRemindersError
              ? error.code === "stale"
                ? "conflict"
                : error.code === "invalid_state"
                  ? "internal"
                  : "unavailable"
              : "unavailable",
          message: "The original pending-reminder page could not be read.",
          retryable: !(error instanceof NetworkRemindersError) || error.code === "unavailable",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed local vault is unavailable.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseNetworkRemindersPageV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored pending reminders did not pass validation.",
          retryable: false,
        });
      }
    },
  );
