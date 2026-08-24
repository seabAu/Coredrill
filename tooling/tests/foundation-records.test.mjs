import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  loadFoundationRecords,
  validateDependencyInventory,
  validateReferenceMatrix,
} from "../scripts/check-foundation-records.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");

let inventory;
let matrix;
let state;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

beforeAll(async () => {
  ({ inventory, matrix, state } = await loadFoundationRecords(repositoryRoot));
});

describe("foundation dependency and test records", () => {
  it("accepts the reviewed repository records", () => {
    expect(validateDependencyInventory(inventory, state)).toEqual([]);
    expect(validateReferenceMatrix(matrix)).toEqual([]);
  });

  it("rejects direct-dependency and lockfile drift", () => {
    const changedState = clone(state);
    changedState.directDependencies[0].version = "99.0.0";
    changedState.lockfileSha256 = "0".repeat(64);
    changedState.cargoDirectDependencies[0].version = "99.0.0";
    changedState.cargoLockSha256 = "0".repeat(64);

    expect(validateDependencyInventory(inventory, changedState)).toEqual(
      expect.arrayContaining([
        "Dependency inventory lockfile hash does not match pnpm-lock.yaml.",
        "Dependency inventory must exactly match every non-workspace direct manifest dependency.",
        "Cargo inventory lockfile hash does not match Cargo.lock.",
        "Cargo inventory must exactly match every direct Cargo dependency.",
      ]),
    );
  });

  it("tracks target-specific and development Cargo declarations", () => {
    expect(state.cargoDirectDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dependencyType: "target.'cfg(target_os = \"windows\")'.dependencies",
          name: "windows-native-keyring-store",
          version: "1.1.0",
        }),
        expect.objectContaining({
          dependencyType: "target.'cfg(target_os = \"windows\")'.dev-dependencies",
          name: "tauri",
          version: "2.11.3",
        }),
      ]),
    );
  });

  it("rejects product identity and license drift", () => {
    const changedState = clone(state);
    changedState.rootPackage.name = "renamed-without-decision";
    changedState.rootPackage.license = "UNLICENSED";

    expect(validateDependencyInventory(inventory, changedState)).toEqual(
      expect.arrayContaining([
        "Root package name must be coredrill.",
        "Root package license must be Apache-2.0.",
      ]),
    );
  });

  it("rejects incomplete dependency ownership metadata", () => {
    const changedInventory = clone(inventory);
    const dependency = changedInventory.packages[0];
    const dependencyLabel = `${dependency.name}@${dependency.version}`;

    dependency.maintainers = [];
    dependency.knownAdvisories = undefined;

    expect(validateDependencyInventory(changedInventory, state)).toEqual(
      expect.arrayContaining([
        `${dependencyLabel} needs registry maintainer handles.`,
        `${dependencyLabel} needs an explicit knownAdvisories array.`,
      ]),
    );
  });

  it("rejects a missing reflow case and promotion of the local host", () => {
    const changedMatrix = clone(matrix);
    changedMatrix.accessibility.cases = changedMatrix.accessibility.cases.filter(
      ({ id }) => id !== "A11Y-REFLOW",
    );
    changedMatrix.hardware.find(({ id }) => id === "HW-LOCAL-DIAG").targetPriority = "required";

    expect(validateReferenceMatrix(changedMatrix)).toEqual(
      expect.arrayContaining([
        "Accessibility case is missing required ID A11Y-REFLOW.",
        "The Windows 10 local host must remain diagnostic-only.",
      ]),
    );
  });

  it("rejects unreproducible hardware, dangling targets, and false lifecycle claims", () => {
    const changedMatrix = clone(matrix);
    changedMatrix.hardware.find(({ id }) => id === "HW-WIN-REF").specification.cpuModel =
      "Unspecified four-core CPU";
    changedMatrix.executionTargets.find(({ id }) => id === "WEB-CHR-N").verification = "passed";
    changedMatrix.executionTargets.find(({ id }) => id === "WEB-SAF-N").operatingSystemTargetIds = [
      "OS-DOES-NOT-EXIST",
    ];
    changedMatrix.executionTargets.find(({ id }) => id === "MOBILE-ANDROID-PWA").scenarios = [];
    changedMatrix.browserBaseline.versions[0].family = "Arbitrary Browser";

    expect(validateReferenceMatrix(changedMatrix)).toEqual(
      expect.arrayContaining([
        "HW-WIN-REF must retain the reproducible reference configuration.",
        "WEB-CHR-N cannot pass while its environment is not available.",
        "WEB-SAF-N references unknown operating system OS-DOES-NOT-EXIST.",
        "MOBILE-ANDROID-PWA must retain its physical-device PWA coverage.",
        "Browser baseline must record Chromium, Edge, Firefox, and Safari families.",
        "WEB-SAF-N must bind Safari 26.6.1 to the Sequoia reference runner.",
      ]),
    );
  });
});
