import path from "node:path";

import { init as inspectLicenses } from "license-checker-rseidelsohn";

const allowedLicenseTokens = new Set([
  "0BSD",
  "Apache-2.0",
  "Artistic-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
]);

function isAllowedExpression(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(isAllowedExpression);
  if (typeof value !== "string" || value.trim() === "") return false;
  if (/unknown|unlicensed|see license/i.test(value)) return false;

  const tokens = value
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR|WITH)\s+|\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => allowedLicenseTokens.has(token));
}

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
  const inventory = await inventoryLicenses(repositoryRoot);
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
    console.log(`Dependency license policy passed for ${Object.keys(inventory).length} packages.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
