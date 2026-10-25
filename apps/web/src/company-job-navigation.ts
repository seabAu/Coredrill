import { parseCompanyJobsRequestV1, type ListCompanyJobsRequestV1 } from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { NAVIGATION_ENTRY_KEY } from "./guarded-navigation.js";

export const COMPANY_JOB_RETURN_KIND = "coredrill-company-job-return-v1";
export interface CompanyJobReturn {
  readonly kind: typeof COMPANY_JOB_RETURN_KIND;
  readonly request: ListCompanyJobsRequestV1;
  readonly jobId: string;
  readonly scrollY: number;
}
/** History retains only scoped IDs/cursor/scroll, never job titles, notes or bodies. */
export const readCompanyJobReturn = (value: unknown): CompanyJobReturn | null => {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = ["kind", "request", "jobId", "scrollY"];
    if (
      Reflect.ownKeys(value).some(
        (key) => typeof key !== "string" || (!keys.includes(key) && key !== NAVIGATION_ENTRY_KEY),
      ) ||
      keys.some((key) => !Object.hasOwn(descriptors, key))
    )
      return null;
    const copied: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      copied[key] = descriptor.value;
    }
    const index = copied[NAVIGATION_ENTRY_KEY];
    if (
      Object.hasOwn(copied, NAVIGATION_ENTRY_KEY) &&
      (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0)
    )
      return null;
    if (
      copied["kind"] !== COMPANY_JOB_RETURN_KIND ||
      typeof copied["jobId"] !== "string" ||
      typeof copied["scrollY"] !== "number" ||
      !Number.isFinite(copied["scrollY"]) ||
      copied["scrollY"] < 0 ||
      copied["scrollY"] > 10_000_000
    )
      return null;
    return Object.freeze({
      kind: COMPANY_JOB_RETURN_KIND,
      request: parseCompanyJobsRequestV1(copied["request"]),
      jobId: entityId("job", copied["jobId"]),
      scrollY: copied["scrollY"],
    });
  } catch {
    return null;
  }
};
