import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { init as inspectLicenses } from "license-checker-rseidelsohn";
import { isAllowedExpression, reviewedLegacyLicense } from "../licenses/license-policy.mjs";
import { discoverLicenseManifestRoots } from "../licenses/workspace-roots.mjs";

function inventoryLicenses(repositoryRoot) {
  return new Promise((resolve, reject) => {
    inspectLicenses(
      {
        excludePrivatePackages: true,
        start: repositoryRoot,
        unknown: true,
      },
      (error, inventory) => {
        if (error) reject(error);
        else resolve(inventory);
      },
    );
  });
}

const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());

try {
  // pnpm's isolated links do not make every workspace dependency reachable from
  // the root manifest. Scan every declared first-level workspace with a manifest.
  const roots = await discoverLicenseManifestRoots(repositoryRoot);
  const inventory = {};
  for (const workspace of roots) {
    const observed = await inventoryLicenses(workspace);
    for (const [name, metadata] of Object.entries(observed)) {
      let licenses = metadata.licenses;
      if (name === "duck@0.1.12" && licenses === "UNKNOWN") {
        const bytes = await readFile(path.join(metadata.path, "LICENSE"));
        licenses = reviewedLegacyLicense(
          name,
          licenses,
          createHash("sha256").update(bytes).digest("hex"),
        );
      }
      if (
        inventory[name] !== undefined &&
        JSON.stringify(inventory[name].licenses) !== JSON.stringify(licenses)
      )
        throw new Error(`Conflicting license metadata for ${name}.`);
      inventory[name] = { ...metadata, licenses };
    }
  }
  const rejected = Object.entries(inventory)
    .filter(([, metadata]) => !isAllowedExpression(metadata.licenses))
    .map(([name, metadata]) => `${name}: ${String(metadata.licenses)}`)
    .sort();

  if (rejected.length > 0) {
    console.error(
      ["Dependency license policy failed:", ...rejected.map((item) => `- ${item}`)].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Dependency license policy passed for ${Object.keys(inventory).length} packages across ${roots.length} manifest roots.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
