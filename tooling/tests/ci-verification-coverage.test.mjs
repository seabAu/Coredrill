import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
const root = path.resolve(import.meta.dirname, "../..");
let scripts, workflow;
beforeAll(async () => {
  scripts = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).scripts;
  workflow = await readFile(path.join(root, ".github/workflows/foundation.yml"), "utf8");
});
const commands = (source) =>
  source.split(" && ").map((value) => {
    const match = /^pnpm ([a-z][a-z0-9:-]*)$/u.exec(value);
    if (match === null)
      throw Error("Review nontrivial verification command syntax before changing the CI gate.");
    return match[1];
  });
const qualityJob = () => {
  const match =
    /^ {2}quality-and-policy:\r?\n(?<body>[\s\S]*?)(?=^ {2}[a-z][a-z0-9-]*:|$(?![\s\S]))/mu.exec(
      workflow,
    );
  if (match?.groups?.body === undefined) throw Error("Missing required foundation job.");
  return match.groups.body;
};
const stepWith = (job, run) => {
  const steps = job.split(/^ {6}- name: /mu).slice(1);
  const matches = steps.filter((step) => step.split(/\r?\n/u).includes(`        run: ${run}`));
  expect(matches).toHaveLength(1);
  return matches[0];
};
describe("complete foundation gate coverage after CI partition", () => {
  it("partitions every full local verification command exactly once without omitting or narrowing a suite", () => {
    const full = commands(scripts.verify),
      staticChecks = commands(scripts["verify:static"]),
      runtimeChecks = commands(scripts["verify:runtime"]);
    expect(new Set(full).size).toBe(full.length);
    expect([...staticChecks, ...runtimeChecks].sort()).toEqual([...full].sort());
    expect(staticChecks.filter((name) => runtimeChecks.includes(name))).toEqual([]);
    // Whole script calls preserve original configs, selection and per-test budgets.
    expect(runtimeChecks).toEqual([
      "test:ui-foundations",
      "test:app-shell",
      "test:performance",
      "test:resilience",
      "test:onboarding",
      "test:documents-browser",
      "test:storage-browser",
      "test:storage-native",
      "test:secure-storage",
      "test:native-archive",
    ]);
  });
  it("dispatches both groups in separate non-fail-fast jobs under the existing35-minute limit", () => {
    const job = qualityJob();
    expect(job).toMatch(/^ {4}name: .+\$\{\{ matrix\.check \}\}/mu);
    expect(job).toMatch(/^ {4}timeout-minutes: 35$/mu);
    expect(job).toMatch(/^ {6}fail-fast: false$/mu);
    const matrix = /^ {8}check: (\[[^\r\n]+\])$/mu.exec(job);
    expect(JSON.parse(matrix[1])).toEqual(["static", "runtime"]);
    expect(stepWith(job, "pnpm verify:static")).toMatch(/^ {8}if: matrix\.check == 'static'$/mu);
    expect(stepWith(job, "pnpm build && pnpm verify:runtime")).toMatch(
      /^ {8}if: matrix\.check == 'runtime'$/mu,
    );
    expect(job).not.toMatch(/^ {8}run: pnpm verify$/mu);
  });
  it("retains build inputs and distinct required artifacts without racing parallel uploads", () => {
    const job = qualityJob();
    expect(job).toContain("run: pnpm install --frozen-lockfile");
    expect(job).toContain(
      "coredrill-failed-production-journeys-${{ matrix.check }}-${{ github.sha }}",
    );
    for (const name of [
      "Upload immutable Chromium extension proof",
      "Emit reviewed license inventory",
      "Emit reviewed Rust license inventory",
    ]) {
      const step = job
        .split(/^ {6}- name: /mu)
        .find((block) => block.startsWith(`${name}\n`) || block.startsWith(`${name}\r\n`));
      expect(step).toBeDefined();
      expect(step).toMatch(/^ {8}if: matrix\.check == 'static'$/mu);
    }
    expect(job).toContain("if-no-files-found: error");
    expect(job).toContain("run: pnpm report:licenses > dependency-licenses.json");
    expect(job).toContain("run: pnpm report:licenses:rust > dependency-licenses-rust.json");
  });
});
