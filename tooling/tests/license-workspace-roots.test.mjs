import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverLicenseManifestRoots } from "../licenses/workspace-roots.mjs";

describe("complete pnpm workspace license scan roots", () => {
  it("includes private apps and shared packages omitted from root reachability, not nested/reserved folders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "coredrill-license-roots-"));
    const relative = path.relative(tmpdir(), root);
    if (
      !relative.startsWith("coredrill-license-roots-") ||
      relative.includes(path.sep) ||
      path.isAbsolute(relative)
    )
      throw new Error("Unsafe synthetic fixture cleanup.");
    try {
      for (const name of [
        "apps/web",
        "apps/extension",
        "packages/domain",
        "packages/new-adapter",
        "apps/reserved/nested",
      ]) {
        await mkdir(path.join(root, name), { recursive: true });
        if (name !== "apps/reserved/nested")
          await writeFile(
            path.join(root, name, "package.json"),
            JSON.stringify({
              name,
              private: true,
              dependencies: { "synthetic-external": "1.0.0" },
            }),
          );
      }
      await writeFile(path.join(root, "apps/reserved/nested/package.json"), "{}");
      const roots = await discoverLicenseManifestRoots(root);
      expect(roots).toEqual([
        root,
        ...["apps/extension", "apps/web", "packages/domain", "packages/new-adapter"].map((name) =>
          path.join(root, name),
        ),
      ]);
      expect(Object.isFrozen(roots)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("supports a single explicitly requested manifest root without workspace parents", async () => {
    const root = path.resolve(import.meta.dirname, "../../apps/web");
    expect(await discoverLicenseManifestRoots(root)).toEqual([root]);
  });
  it("includes every direct dependency's actual manifest root in this repository", async () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const roots = await discoverLicenseManifestRoots(root);
    expect(roots).toContain(path.join(root, "apps/web"));
    expect(roots).toContain(path.join(root, "apps/extension"));
    expect(roots).toContain(path.join(root, "packages/documents"));
    expect(roots).toContain(path.join(root, "packages/ui"));
    expect(roots.length).toBeGreaterThan(1);
  });
});
