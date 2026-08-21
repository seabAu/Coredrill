import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baseRef = process.argv[2];

function runNode(relativeEntryPoint, args, env = process.env) {
  const result = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, relativeEntryPoint), ...args],
    {
      cwd: repositoryRoot,
      env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(`Unable to run ${relativeEntryPoint}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

const turboEnvironment = baseRef
  ? { ...process.env, TURBO_SCM_BASE: baseRef, TURBO_SCM_HEAD: "HEAD" }
  : process.env;

console.log(`Affected-check base: ${baseRef ?? "tool default"}`);

for (const task of ["build", "typecheck", "lint"]) {
  const status = runNode(
    "tooling/scripts/run-turbo.mjs",
    ["run", task, "--affected"],
    turboEnvironment,
  );
  if (status !== 0) process.exit(status);
}

const toolingLintStatus = runNode("node_modules/eslint/bin/eslint.js", [
  "tooling",
  "--max-warnings",
  "0",
]);
if (toolingLintStatus !== 0) process.exit(toolingLintStatus);

const vitestArguments = ["run", "--changed", "--passWithNoTests"];
if (baseRef) vitestArguments.push(baseRef);
process.exitCode = runNode("node_modules/vitest/vitest.mjs", vitestArguments);
