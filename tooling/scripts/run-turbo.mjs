import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const turboEntryPoint = resolve(repositoryRoot, "node_modules/turbo/bin/turbo");

const result = spawnSync(process.execPath, [turboEntryPoint, ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    DO_NOT_TRACK: "1",
    TURBO_TELEMETRY_DISABLED: "1",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to run the pinned Turborepo CLI: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
