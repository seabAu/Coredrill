import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

/** Match the repository's apps/* and packages/* workspace roots, including private apps. */
export const discoverLicenseManifestRoots = async (repositoryRoot) => {
  const roots = [repositoryRoot];
  for (const parent of ["apps", "packages"]) {
    const directory = path.join(repositoryRoot, parent);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (!entry.isDirectory()) continue;
      const workspace = path.join(directory, entry.name);
      try {
        await readFile(path.join(workspace, "package.json"), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      roots.push(workspace);
    }
  }
  return Object.freeze(roots);
};
