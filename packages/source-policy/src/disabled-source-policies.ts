export const LINKEDIN_AUTOMATION_POLICY_INPUT_V1 = Object.freeze({
  specVersion: 1,
  id: "linkedin-automation",
  owner: "Coredrill source policy owners",
  status: "disabled",
  allowedMethods: Object.freeze([]),
  baseDomains: Object.freeze(["linkedin.com", "www.linkedin.com"]),
  termsUrl:
    "https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions",
  privacyUrl: "https://www.linkedin.com/legal/privacy-policy",
  licenseOrReuseBasis:
    "No automated reuse basis. LinkedIn prohibits crawlers, bots, browser plug-ins, and extensions that scrape or automate its website.",
  reviewedAt: "2026-09-26T00:00:00.000Z",
  reviewDueAt: "2026-10-26T00:00:00.000Z",
  ratePolicy: "No automated request rate is permitted.",
  retention: "No automated LinkedIn response body or extracted field may be retained.",
  attribution: "not_required",
  credentials: "none",
  userVisibleDataFlow:
    "No automated data flow. The user may enter a fact manually and retain its source URL as a note.",
  killSwitch: true,
});

export const GLASSDOOR_AUTOMATION_POLICY_INPUT_V1 = Object.freeze({
  specVersion: 1,
  id: "glassdoor-automation",
  owner: "Coredrill source policy owners",
  status: "disabled",
  allowedMethods: Object.freeze([]),
  baseDomains: Object.freeze(["glassdoor.com", "www.glassdoor.com"]),
  termsUrl: "https://www.glassdoor.com/about/terms-2022-12-01/",
  privacyUrl: "https://hrtechprivacy.com/brands/glassdoor",
  licenseOrReuseBasis:
    "No automated reuse basis. Glassdoor prohibits automated scraping, stripping, or mining without express written permission.",
  reviewedAt: "2026-09-26T00:00:00.000Z",
  reviewDueAt: "2026-10-26T00:00:00.000Z",
  ratePolicy: "No automated request rate is permitted.",
  retention: "No automated Glassdoor response body or extracted field may be retained.",
  attribution: "not_required",
  credentials: "none",
  userVisibleDataFlow:
    "No automated data flow. The user may enter a fact manually and retain its source URL as a note.",
  killSwitch: true,
});
