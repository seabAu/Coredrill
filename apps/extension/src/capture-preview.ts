import {
  safeParseExtensionCaptureDraftV1,
  type ExtensionCaptureDraftV1,
  type PageFieldCapture,
} from "@coredrill/capture-core";

export interface CapturePreviewFieldV1 {
  readonly value: string;
  readonly origin: "detected" | "user" | "missing";
  readonly confidence?: number;
}

export interface CapturePreviewV1 {
  readonly specVersion: 1;
  readonly title: CapturePreviewFieldV1;
  readonly company: CapturePreviewFieldV1;
  readonly location?: string;
  readonly salary?: string;
  readonly selectedText?: string;
  readonly source: {
    readonly hostname: string;
    readonly signal: "Schema.org JobPosting" | "Page elements";
    readonly url: string;
  };
  readonly confidence?: number;
  readonly capturedAt: string;
  readonly freshness: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum = 1024): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length === 0 || normalized.length > maximum ? undefined : normalized;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  if (!Array.isArray(value)) return undefined;
  return value.find((item): item is Record<string, unknown> => isRecord(item));
}

function locationPreview(posting: Record<string, unknown> | undefined): string | undefined {
  if (posting === undefined) return undefined;
  const remote = boundedText(posting["jobLocationType"], 128)?.toUpperCase() === "TELECOMMUTE";
  const location = firstRecord(posting["jobLocation"]);
  const address = firstRecord(location?.["address"]);
  const parts = [
    boundedText(address?.["addressLocality"], 256),
    boundedText(address?.["addressRegion"], 256),
    boundedText(address?.["addressCountry"], 256),
  ].filter((value): value is string => value !== undefined);
  const applicantLocation = firstRecord(posting["applicantLocationRequirements"]);
  const applicantName = boundedText(applicantLocation?.["name"], 512);
  if (remote && parts.length > 0) return `Remote · ${parts.join(", ")}`;
  if (remote && applicantName !== undefined) return `Remote · ${applicantName}`;
  if (remote) return "Remote";
  if (parts.length > 0) return parts.join(", ");
  return applicantName;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function salaryPreview(posting: Record<string, unknown> | undefined): string | undefined {
  if (posting === undefined) return undefined;
  const salary = firstRecord(posting["baseSalary"]);
  if (salary === undefined) return undefined;
  const currency = boundedText(salary["currency"], 16);
  const value = firstRecord(salary["value"]);
  const minimum = finiteNumber(value?.["minValue"]);
  const maximum = finiteNumber(value?.["maxValue"]);
  const exact = finiteNumber(value?.["value"]);
  const unit = boundedText(value?.["unitText"], 64)?.toLowerCase();
  const amount =
    minimum !== undefined && maximum !== undefined
      ? `${formatAmount(minimum)}–${formatAmount(maximum)}`
      : exact === undefined
        ? minimum === undefined
          ? maximum === undefined
            ? undefined
            : `up to ${formatAmount(maximum)}`
          : `from ${formatAmount(minimum)}`
        : formatAmount(exact);
  if (amount === undefined) return undefined;
  return `${currency === undefined ? "" : `${currency} `}${amount}${unit === undefined ? "" : ` / ${unit}`}`;
}

function fieldPreview(
  correction: string | undefined,
  detected: PageFieldCapture | undefined,
): CapturePreviewFieldV1 {
  if (correction !== undefined) return { value: correction, origin: "user" };
  if (detected !== undefined) {
    return { value: detected.value, origin: "detected", confidence: detected.confidence };
  }
  return { value: "Needs review", origin: "missing" };
}

export function formatCaptureFreshnessV1(capturedAt: string, now = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - Date.parse(capturedAt));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Captured just now";
  if (minutes < 60) return `Captured ${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Captured ${String(hours)} hr ago`;
  const days = Math.floor(hours / 24);
  return `Captured ${String(days)} day${days === 1 ? "" : "s"} ago`;
}

/** Builds inert display-only data; it never fetches or promotes a field to trusted status. */
export function createCapturePreviewV1(input: unknown, now = new Date()): CapturePreviewV1 {
  const parsed = safeParseExtensionCaptureDraftV1(input);
  if (!parsed.success) throw new RangeError("Capture draft is invalid.");
  const draft: ExtensionCaptureDraftV1 = parsed.data;
  const snapshot = draft.snapshot;
  const posting = firstRecord(snapshot.jsonLd?.[0]);
  const confidences = [
    snapshot.fields.title?.confidence,
    snapshot.fields.company?.confidence,
  ].filter((value): value is number => value !== undefined);
  const location = locationPreview(posting);
  const salary = salaryPreview(posting);
  return {
    specVersion: 1,
    title: fieldPreview(draft.corrections?.title, snapshot.fields.title),
    company: fieldPreview(draft.corrections?.company, snapshot.fields.company),
    ...(location === undefined ? {} : { location }),
    ...(salary === undefined ? {} : { salary }),
    ...(snapshot.selectedText === undefined ? {} : { selectedText: snapshot.selectedText }),
    source: {
      hostname: new URL(snapshot.canonicalUrl ?? snapshot.url).hostname,
      signal: snapshot.jsonLd === undefined ? "Page elements" : "Schema.org JobPosting",
      url: snapshot.canonicalUrl ?? snapshot.url,
    },
    ...(confidences.length === 0 ? {} : { confidence: Math.min(...confidences) }),
    capturedAt: draft.capturedAt,
    freshness: formatCaptureFreshnessV1(draft.capturedAt, now),
  };
}
