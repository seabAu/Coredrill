import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("keeps every Playwright suite in a disjoint child output directory so later suites preserve earlier proof", async () => {
  const resultRoot = path.join(root, "test-results");
  const configs = readdirSync(root).filter((name) => /^playwright\..+\.config\.mjs$/u.test(name));
  expect(configs.length).toBeGreaterThan(0);
  const directories = [];
  for (const name of configs) {
    const { default: config } = await import(pathToFileURL(path.join(root, name)).href);
    expect(typeof config.outputDir, `${name} must not use the root-cleaning default`).toBe(
      "string",
    );
    const directory = path.resolve(root, config.outputDir);
    expect(directory.startsWith(`${resultRoot}${path.sep}`), name).toBe(true);
    for (const prior of directories) {
      expect(
        directory !== prior &&
          !directory.startsWith(`${prior}${path.sep}`) &&
          !prior.startsWith(`${directory}${path.sep}`),
        name,
      ).toBe(true);
    }
    directories.push(directory);
  }
});
