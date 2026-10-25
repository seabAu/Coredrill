import {
  parseCompanySourcesRequestV1,
  type ListCompanySourcesRequestV1,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { NAVIGATION_ENTRY_KEY } from "./guarded-navigation.js";

export const COMPANY_SOURCE_RETURN_KIND = "coredrill-company-source-return-v1";
export interface CompanySourceReturn {
  readonly kind: typeof COMPANY_SOURCE_RETURN_KIND;
  readonly request: ListCompanySourcesRequestV1;
  readonly sourceId: string;
  readonly jobId: string;
  readonly scrollY: number;
}
/** Content-free company-page return; the job opens its whole Source workspace. */
export const readCompanySourceReturn = (value: unknown): CompanySourceReturn | null => {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value),
      keys = ["kind", "request", "sourceId", "jobId", "scrollY"];
    if (
      Reflect.ownKeys(value).some(
        (key) => typeof key !== "string" || (!keys.includes(key) && key !== NAVIGATION_ENTRY_KEY),
      ) ||
      keys.some((key) => !Object.hasOwn(descriptors, key))
    )
      return null;
    const raw: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      raw[key] = descriptor.value;
    }
    const index = raw[NAVIGATION_ENTRY_KEY];
    if (
      Object.hasOwn(raw, NAVIGATION_ENTRY_KEY) &&
      (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0)
    )
      return null;
    if (
      raw["kind"] !== COMPANY_SOURCE_RETURN_KIND ||
      typeof raw["sourceId"] !== "string" ||
      typeof raw["jobId"] !== "string" ||
      typeof raw["scrollY"] !== "number" ||
      !Number.isFinite(raw["scrollY"]) ||
      raw["scrollY"] < 0 ||
      raw["scrollY"] > 10_000_000
    )
      return null;
    return Object.freeze({
      kind: COMPANY_SOURCE_RETURN_KIND,
      request: parseCompanySourcesRequestV1(raw["request"]),
      sourceId: entityId("job-source", raw["sourceId"]),
      jobId: entityId("job", raw["jobId"]),
      scrollY: raw["scrollY"],
    });
  } catch {
    return null;
  }
};
