import type { PageCaptureSnapshot, PageFieldCapture } from "@coredrill/capture-core";

/** This function is serialized by browser.scripting; keep every runtime dependency inside it. */
export function captureActivePage(): PageCaptureSnapshot {
  const maximumSelectedText = 64 * 1024;
  const maximumJsonLdItems = 64;
  const maximumJsonLdCharacters = 512 * 1024;

  const boundedText = (value: unknown, maximum: number): string | undefined => {
    if (typeof value !== "string") return undefined;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized === "" || normalized.length > maximum ? undefined : normalized;
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const isJobPosting = (value: unknown): value is Record<string, unknown> => {
    if (!isRecord(value)) return false;
    const type = value["@type"];
    return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
  };
  const jobPostings: Record<string, unknown>[] = [];
  let parsedCharacters = 0;
  const consider = (value: unknown): void => {
    if (jobPostings.length >= maximumJsonLdItems) return;
    if (isJobPosting(value)) {
      jobPostings.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        consider(item);
        if (jobPostings.length >= maximumJsonLdItems) return;
      }
      return;
    }
    if (isRecord(value) && Array.isArray(value["@graph"])) consider(value["@graph"]);
  };

  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  )) {
    const text = script.textContent;
    if (
      text.length === 0 ||
      text.length > maximumJsonLdCharacters ||
      parsedCharacters + text.length > maximumJsonLdCharacters
    ) {
      continue;
    }
    parsedCharacters += text.length;
    try {
      consider(JSON.parse(text) as unknown);
    } catch {
      // A malformed page-owned JSON-LD block is ignored; no page exception crosses the boundary.
    }
    if (jobPostings.length >= maximumJsonLdItems) break;
  }

  const firstPosting = jobPostings[0];
  const fields: { title?: PageFieldCapture; company?: PageFieldCapture } = {};
  const jsonLdTitle = boundedText(firstPosting?.["title"], 1024);
  if (jsonLdTitle !== undefined) {
    fields.title = {
      value: jsonLdTitle,
      pointer: "/content/jsonLd/0/title",
      method: "jsonld",
      confidence: 0.98,
    };
  } else {
    const heading = document.querySelector<HTMLElement>("h1");
    const headingText = boundedText(heading?.textContent, 1024);
    const documentTitle = boundedText(document.title, 1024);
    const title = headingText ?? documentTitle;
    if (title !== undefined) {
      fields.title = {
        value: title,
        pointer: headingText === undefined ? "/document/title" : "/document/h1",
        method: "selector",
        confidence: headingText === undefined ? 0.45 : 0.65,
      };
    }
  }

  const organization = firstPosting?.["hiringOrganization"];
  const jsonLdCompany = boundedText(
    isRecord(organization) ? organization["name"] : undefined,
    1024,
  );
  if (jsonLdCompany !== undefined) {
    fields.company = {
      value: jsonLdCompany,
      pointer: "/content/jsonLd/0/hiringOrganization/name",
      method: "jsonld",
      confidence: 0.98,
    };
  } else {
    const companyElement = document.querySelector<HTMLElement>("[data-company]");
    const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]');
    const companyText =
      boundedText(companyElement?.textContent, 1024) ?? boundedText(siteName?.content, 1024);
    if (companyText !== undefined) {
      fields.company = {
        value: companyText,
        pointer:
          companyElement === null
            ? '/document/meta[property="og:site_name"]'
            : "/document/[data-company]",
        method: "selector",
        confidence: companyElement === null ? 0.4 : 0.6,
      };
    }
  }

  const canonicalHref = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  const canonicalUrl = (() => {
    if (canonicalHref === undefined || canonicalHref.length > 8192) return undefined;
    try {
      const parsed = new URL(canonicalHref);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  })();
  const rawSelectedText = window.getSelection()?.toString();
  const normalizedSelectedText = rawSelectedText?.replace(/\s+/g, " ").trim();
  if (normalizedSelectedText !== undefined && normalizedSelectedText.length > maximumSelectedText) {
    throw new RangeError("Selected text exceeds the capture boundary.");
  }
  const selectedText = boundedText(normalizedSelectedText, maximumSelectedText);
  const pageTitle = boundedText(document.title, 1024);

  return {
    specVersion: 1,
    url: location.href,
    ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
    ...(pageTitle === undefined ? {} : { pageTitle }),
    ...(selectedText === undefined ? {} : { selectedText }),
    ...(jobPostings.length === 0
      ? {}
      : { jsonLd: jobPostings as unknown as NonNullable<PageCaptureSnapshot["jsonLd"]> }),
    fields,
  };
}
