import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildContrastReport } from "../../packages/ui/dist/index.js";

const repositoryRoot = process.cwd();
const artifactPath = path.join(
  repositoryRoot,
  "docs",
  "proof",
  "artifacts",
  "ui-foundation-contrast-report.json",
);
const expected = `${JSON.stringify(
  {
    artifact: "coredrill-ui-foundation-contrast-report",
    generatedFrom: "@coredrill/ui buildContrastReport()",
    ...buildContrastReport(),
  },
  null,
  2,
)}\n`;

if (process.argv.includes("--check")) {
  const actual = await readFile(artifactPath, "utf8").catch(() => "");
  if (actual !== expected) {
    throw new Error(
      "UI contrast report is missing or stale. Run pnpm generate:ui-contrast-report after building @coredrill/ui.",
    );
  }
  console.log("UI contrast report is current and every reviewed case passes.");
} else {
  await writeFile(artifactPath, expected, "utf8");
  console.log(`Wrote ${path.relative(repositoryRoot, artifactPath)}.`);
}
