import { expect, test } from "@playwright/test";

// Keep the original per-test timeout and isolated database lifecycle for every case.
const executedComponents = [
  "tracker",
  "pipeline",
  "view",
  "document",
  "jobSearch",
  "diagnostic",
  "requirementEvidence",
  "companyDirectory",
  "companyWorkspace",
  "contactDirectory",
  "contactWorkspace",
  "contactHistory",
  "interactionRecording",
  "contactFieldEvidence",
  "contactDeletion",
  "viewedContactDeletion",
  "contactFieldUse",
  "companyJobs",
  "companyInteractions",
  "companySources",
];
for (const componentName of executedComponents) {
  test(`runs the versioned Phase 1 repository contract component ${componentName} in browser SQLite`, async ({
    page,
  }) => {
    await page.goto("/storage-verification.html");
    await expect(page.getByRole("status")).toHaveText("Harness ready");
    await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);

    const proof = await page.evaluate(
      (component) => globalThis.coredrillStorageSpike.runPhase1RepositoryContracts(component),
      componentName,
    );

    expect(proof.manifest.schemaVersion).toBe(24);
    expect(proof.manifest.suiteName).toBe("phase-1-repository-contracts-v24");
    expect(Object.keys(proof.manifest.components)).toEqual([
      "tracker",
      "pipeline",
      "view",
      "document",
      "jobSearch",
      "diagnostic",
      "requirementEvidence",
      "companyDirectory",
      "companyWorkspace",
      "contactDirectory",
      "contactWorkspace",
      "contactHistory",
      "interactionRecording",
      "contactFieldEvidence",
      "contactDeletion",
      "viewedContactDeletion",
      "contactFieldUse",
      "companyJobs",
      "companyInteractions",
      "companySources",
    ]);
    const reviewedCases = proof.manifest.caseNames;
    expect(reviewedCases).toHaveLength(44);
    expect(
      Object.values(proof.manifest.components).flatMap((component) =>
        Object.values(component.cases),
      ),
    ).toEqual(reviewedCases);
    const component = proof.manifest.components[componentName];
    expect(proof.componentName).toBe(componentName);
    expect(proof.run).toEqual({
      adapterName: "official-sqlite-wasm-opfs-sahpool",
      suiteName: component.suiteName,
      completedCases: Object.values(component.cases),
    });
  });
}
