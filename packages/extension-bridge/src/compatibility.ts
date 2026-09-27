import { CAPTURE_ENVELOPE_SPEC_VERSION } from "@coredrill/contracts";

import {
  TRANSFER_LIMITS,
  TRANSFER_SPEC_VERSION,
  transferErrorResponse,
  type TransferErrorV1,
} from "./transfer.js";

export const COMPATIBILITY_SPEC_VERSION = 1 as const;
export const COMPATIBILITY_CAPABILITIES = [
  "capture.transfer.pull.v1",
  "capture.transfer.ack.v1",
] as const;
export const COMPATIBILITY_LIMITS = Object.freeze({
  maxRequestBytes: TRANSFER_LIMITS.maxRequestBytes,
  maxVersions: 4,
  maxCapabilities: 8,
  maxCapabilityLength: 64,
  maxOriginLength: 256,
});

export interface CompatibilityHandshakeRequestV1 {
  readonly specVersion: typeof COMPATIBILITY_SPEC_VERSION;
  readonly type: "capture.compatibility.handshake.v1";
  readonly requestId: string;
  readonly appOrigin: string;
  readonly expectedExtensionId: string;
  readonly supportedTransferVersions: readonly number[];
  readonly supportedCaptureVersions: readonly number[];
  readonly requiredCapabilities: readonly string[];
}

export interface CompatibilityAcceptedV1 {
  readonly specVersion: typeof COMPATIBILITY_SPEC_VERSION;
  readonly type: "capture.compatibility.accepted.v1";
  readonly requestId: string;
  readonly appOrigin: string;
  readonly extensionId: string;
  readonly selectedTransferVersion: typeof TRANSFER_SPEC_VERSION;
  readonly selectedCaptureVersion: typeof CAPTURE_ENVELOPE_SPEC_VERSION;
  readonly capabilities: typeof COMPATIBILITY_CAPABILITIES;
}

export type CompatibilityHandshakeResponseV1 = CompatibilityAcceptedV1 | TransferErrorV1;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/u;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function encodedBytes(value: unknown): number | undefined {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? new TextEncoder().encode(encoded).byteLength : undefined;
  } catch {
    return undefined;
  }
}

function isExactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > COMPATIBILITY_LIMITS.maxOriginLength) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isVersionList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= COMPATIBILITY_LIMITS.maxVersions &&
    value.every((version) => Number.isSafeInteger(version) && version >= 1 && version <= 255) &&
    new Set(value).size === value.length
  );
}

function isCapabilityList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= COMPATIBILITY_LIMITS.maxCapabilities &&
    value.every(
      (capability) =>
        typeof capability === "string" &&
        capability.length <= COMPATIBILITY_LIMITS.maxCapabilityLength &&
        CAPABILITY_PATTERN.test(capability),
    ) &&
    new Set(value).size === value.length
  );
}

function isTransferErrorForRequest(
  input: Record<string, unknown>,
  requestId: string,
): input is Record<string, unknown> & TransferErrorV1 {
  return (
    input["specVersion"] === TRANSFER_SPEC_VERSION &&
    input["type"] === "capture.transfer.error.v1" &&
    hasExactKeys(input, ["specVersion", "type", "requestId", "code", "message"]) &&
    input["requestId"] === requestId &&
    typeof input["code"] === "string" &&
    input["code"].length > 0 &&
    input["code"].length <= 128 &&
    typeof input["message"] === "string" &&
    input["message"].length > 0 &&
    input["message"].length <= 512
  );
}

export function parseCompatibilityHandshakeRequest(
  input: unknown,
): CompatibilityHandshakeRequestV1 | undefined {
  const size = encodedBytes(input);
  if (
    size === undefined ||
    size > COMPATIBILITY_LIMITS.maxRequestBytes ||
    !isRecord(input) ||
    !hasExactKeys(input, [
      "specVersion",
      "type",
      "requestId",
      "appOrigin",
      "expectedExtensionId",
      "supportedTransferVersions",
      "supportedCaptureVersions",
      "requiredCapabilities",
    ]) ||
    input["specVersion"] !== COMPATIBILITY_SPEC_VERSION ||
    input["type"] !== "capture.compatibility.handshake.v1" ||
    typeof input["requestId"] !== "string" ||
    !REQUEST_ID_PATTERN.test(input["requestId"]) ||
    !isExactHttpsOrigin(input["appOrigin"]) ||
    typeof input["expectedExtensionId"] !== "string" ||
    !EXTENSION_ID_PATTERN.test(input["expectedExtensionId"]) ||
    !isVersionList(input["supportedTransferVersions"]) ||
    !isVersionList(input["supportedCaptureVersions"]) ||
    !isCapabilityList(input["requiredCapabilities"])
  ) {
    return undefined;
  }
  return {
    specVersion: COMPATIBILITY_SPEC_VERSION,
    type: "capture.compatibility.handshake.v1",
    requestId: input["requestId"],
    appOrigin: input["appOrigin"],
    expectedExtensionId: input["expectedExtensionId"],
    supportedTransferVersions: Object.freeze([...input["supportedTransferVersions"]]),
    supportedCaptureVersions: Object.freeze([...input["supportedCaptureVersions"]]),
    requiredCapabilities: Object.freeze([...input["requiredCapabilities"]]),
  };
}

export function createCompatibilityHandshakeRequest(input: {
  readonly requestId: string;
  readonly appOrigin: string;
  readonly expectedExtensionId: string;
}): CompatibilityHandshakeRequestV1 {
  const request = {
    specVersion: COMPATIBILITY_SPEC_VERSION,
    type: "capture.compatibility.handshake.v1",
    requestId: input.requestId,
    appOrigin: input.appOrigin,
    expectedExtensionId: input.expectedExtensionId,
    supportedTransferVersions: [TRANSFER_SPEC_VERSION],
    supportedCaptureVersions: [CAPTURE_ENVELOPE_SPEC_VERSION],
    requiredCapabilities: [...COMPATIBILITY_CAPABILITIES],
  } as const;
  const parsed = parseCompatibilityHandshakeRequest(request);
  if (parsed === undefined) throw new TypeError("Compatibility handshake identity is invalid.");
  return parsed;
}

export function negotiateCompatibilityHandshake(
  request: CompatibilityHandshakeRequestV1,
  actual: { readonly appOrigin: string; readonly extensionId: string },
): CompatibilityHandshakeResponseV1 {
  if (request.appOrigin !== actual.appOrigin) {
    return transferErrorResponse(
      "app_origin_mismatch",
      "The app origin does not match the authenticated message sender.",
      request.requestId,
    );
  }
  if (request.expectedExtensionId !== actual.extensionId) {
    return transferErrorResponse(
      "extension_id_mismatch",
      "The requested extension ID does not match this extension.",
      request.requestId,
    );
  }
  if (!request.supportedTransferVersions.includes(TRANSFER_SPEC_VERSION)) {
    return transferErrorResponse(
      "transfer_version_mismatch",
      "No supported transfer protocol version is shared.",
      request.requestId,
    );
  }
  if (!request.supportedCaptureVersions.includes(CAPTURE_ENVELOPE_SPEC_VERSION)) {
    return transferErrorResponse(
      "capture_version_mismatch",
      "No supported capture envelope version is shared.",
      request.requestId,
    );
  }
  if (
    request.requiredCapabilities.some(
      (capability) => !(COMPATIBILITY_CAPABILITIES as readonly string[]).includes(capability),
    )
  ) {
    return transferErrorResponse(
      "capability_mismatch",
      "A required transfer capability is unavailable.",
      request.requestId,
    );
  }
  return {
    specVersion: COMPATIBILITY_SPEC_VERSION,
    type: "capture.compatibility.accepted.v1",
    requestId: request.requestId,
    appOrigin: actual.appOrigin,
    extensionId: actual.extensionId,
    selectedTransferVersion: TRANSFER_SPEC_VERSION,
    selectedCaptureVersion: CAPTURE_ENVELOPE_SPEC_VERSION,
    capabilities: COMPATIBILITY_CAPABILITIES,
  };
}

export function safeParseCompatibilityHandshakeResponse(
  input: unknown,
  request: CompatibilityHandshakeRequestV1,
): CompatibilityHandshakeResponseV1 | undefined {
  if (!isRecord(input)) return undefined;
  if (isTransferErrorForRequest(input, request.requestId)) return input;
  const capabilities = input["capabilities"];
  if (
    !hasExactKeys(input, [
      "specVersion",
      "type",
      "requestId",
      "appOrigin",
      "extensionId",
      "selectedTransferVersion",
      "selectedCaptureVersion",
      "capabilities",
    ]) ||
    input["specVersion"] !== COMPATIBILITY_SPEC_VERSION ||
    input["type"] !== "capture.compatibility.accepted.v1" ||
    input["requestId"] !== request.requestId ||
    input["appOrigin"] !== request.appOrigin ||
    input["extensionId"] !== request.expectedExtensionId ||
    input["selectedTransferVersion"] !== TRANSFER_SPEC_VERSION ||
    !request.supportedTransferVersions.includes(TRANSFER_SPEC_VERSION) ||
    input["selectedCaptureVersion"] !== CAPTURE_ENVELOPE_SPEC_VERSION ||
    !request.supportedCaptureVersions.includes(CAPTURE_ENVELOPE_SPEC_VERSION) ||
    !Array.isArray(capabilities) ||
    capabilities.length !== COMPATIBILITY_CAPABILITIES.length ||
    !COMPATIBILITY_CAPABILITIES.every((capability, index) => capabilities[index] === capability) ||
    request.requiredCapabilities.some((capability) => !capabilities.includes(capability))
  ) {
    return undefined;
  }
  return {
    specVersion: COMPATIBILITY_SPEC_VERSION,
    type: "capture.compatibility.accepted.v1",
    requestId: request.requestId,
    appOrigin: request.appOrigin,
    extensionId: request.expectedExtensionId,
    selectedTransferVersion: TRANSFER_SPEC_VERSION,
    selectedCaptureVersion: CAPTURE_ENVELOPE_SPEC_VERSION,
    capabilities: COMPATIBILITY_CAPABILITIES,
  };
}
