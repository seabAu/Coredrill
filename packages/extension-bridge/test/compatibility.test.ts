import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_CAPABILITIES,
  COMPATIBILITY_LIMITS,
  createCompatibilityHandshakeRequest,
  negotiateCompatibilityHandshake,
  parseCompatibilityHandshakeRequest,
  safeParseCompatibilityHandshakeResponse,
  type CompatibilityHandshakeRequestV1,
} from "../src/index.js";

const appOrigin = "https://app.coredrill.test";
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const requestId = "compatibility_request_abc";

function request(): CompatibilityHandshakeRequestV1 {
  return createCompatibilityHandshakeRequest({
    requestId,
    appOrigin,
    expectedExtensionId: extensionId,
  });
}

describe("extension compatibility handshake", () => {
  it("requires exact bounded request identity and shape", () => {
    const valid = request();
    expect(parseCompatibilityHandshakeRequest(valid)).toEqual(valid);
    expect(parseCompatibilityHandshakeRequest({ ...valid, unexpected: true })).toBeUndefined();
    expect(
      parseCompatibilityHandshakeRequest({ ...valid, appOrigin: `${appOrigin}/path` }),
    ).toBeUndefined();
    expect(
      parseCompatibilityHandshakeRequest({ ...valid, appOrigin: "http://app.coredrill.test" }),
    ).toBeUndefined();
    expect(
      parseCompatibilityHandshakeRequest({
        ...valid,
        requiredCapabilities: Array.from(
          { length: COMPATIBILITY_LIMITS.maxCapabilities + 1 },
          (_, index) => `capability.${String(index)}`,
        ),
      }),
    ).toBeUndefined();
    expect(
      parseCompatibilityHandshakeRequest({
        ...valid,
        supportedTransferVersions: [1, 1],
      }),
    ).toBeUndefined();
  });

  it("accepts only exact app-origin and extension-ID agreement", () => {
    const valid = request();
    expect(negotiateCompatibilityHandshake(valid, { appOrigin, extensionId })).toMatchObject({
      type: "capture.compatibility.accepted.v1",
      appOrigin,
      extensionId,
    });
    expect(
      negotiateCompatibilityHandshake(valid, {
        appOrigin: "https://different.coredrill.test",
        extensionId,
      }),
    ).toMatchObject({ type: "capture.transfer.error.v1", code: "app_origin_mismatch" });
    expect(
      negotiateCompatibilityHandshake(valid, {
        appOrigin,
        extensionId: "ponmlkjihgfedcbaponmlkjihgfedcba",
      }),
    ).toMatchObject({ type: "capture.transfer.error.v1", code: "extension_id_mismatch" });
  });

  it("fails closed when versions or required capabilities do not overlap", () => {
    const valid = request();
    expect(
      negotiateCompatibilityHandshake(
        { ...valid, supportedTransferVersions: [2] },
        { appOrigin, extensionId },
      ),
    ).toMatchObject({ type: "capture.transfer.error.v1", code: "transfer_version_mismatch" });
    expect(
      negotiateCompatibilityHandshake(
        { ...valid, supportedCaptureVersions: [2] },
        { appOrigin, extensionId },
      ),
    ).toMatchObject({ type: "capture.transfer.error.v1", code: "capture_version_mismatch" });
    expect(
      negotiateCompatibilityHandshake(
        { ...valid, requiredCapabilities: ["capture.transfer.delete.v1"] },
        { appOrigin, extensionId },
      ),
    ).toMatchObject({ type: "capture.transfer.error.v1", code: "capability_mismatch" });
  });

  it("validates the accepted identity, selected versions, and exact capability set", () => {
    const valid = request();
    const accepted = negotiateCompatibilityHandshake(valid, { appOrigin, extensionId });
    expect(safeParseCompatibilityHandshakeResponse(accepted, valid)).toEqual(accepted);
    expect(
      safeParseCompatibilityHandshakeResponse(
        { ...accepted, extensionId: "ponmlkjihgfedcbaponmlkjihgfedcba" },
        valid,
      ),
    ).toBeUndefined();
    expect(
      safeParseCompatibilityHandshakeResponse({ ...accepted, selectedTransferVersion: 2 }, valid),
    ).toBeUndefined();
    expect(
      safeParseCompatibilityHandshakeResponse(
        {
          ...accepted,
          capabilities: [...COMPATIBILITY_CAPABILITIES, "capture.transfer.delete.v1"],
        },
        valid,
      ),
    ).toBeUndefined();
  });
});
