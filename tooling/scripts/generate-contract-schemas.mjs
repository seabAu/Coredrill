import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractsEntry = path.join(repositoryRoot, "packages/contracts/dist/index.js");
const captureEnvelopeSchemaPath = path.join(
  repositoryRoot,
  "packages/contracts/schemas/capture-envelope.v1.schema.json",
);

async function generatedSchemaText() {
  const contracts = await import(pathToFileURL(contractsEntry).href);
  const prettierConfig = await resolveConfig(captureEnvelopeSchemaPath);
  return format(JSON.stringify(contracts.captureEnvelopeV1JsonSchema), {
    ...prettierConfig,
    filepath: captureEnvelopeSchemaPath,
  });
}

async function checkSchema(expected) {
  let actual;
  try {
    actual = await readFile(captureEnvelopeSchemaPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.error("Generated capture-envelope JSON Schema is missing.");
      return 1;
    }
    throw error;
  }

  if (actual !== expected) {
    console.error(
      "Generated capture-envelope JSON Schema is stale. Build @coredrill/contracts and run pnpm generate:contract-schemas.",
    );
    return 1;
  }

  console.log("Generated capture-envelope JSON Schema matches the Zod boundary contract.");
  return 0;
}

const expected = await generatedSchemaText();
if (process.argv.includes("--check")) {
  process.exitCode = await checkSchema(expected);
} else {
  await mkdir(path.dirname(captureEnvelopeSchemaPath), { recursive: true });
  await writeFile(captureEnvelopeSchemaPath, expected, "utf8");
  console.log("Generated packages/contracts/schemas/capture-envelope.v1.schema.json.");
}
