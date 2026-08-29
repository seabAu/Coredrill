import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractsEntry = path.join(repositoryRoot, "packages/contracts/dist/index.js");
const documentsEntry = path.join(repositoryRoot, "packages/documents/dist/index.js");
const generatedSchemas = [
  {
    exportName: "captureEnvelopeV1JsonSchema",
    path: path.join(repositoryRoot, "packages/contracts/schemas/capture-envelope.v1.schema.json"),
  },
  {
    exportName: "portableArchiveManifestV1JsonSchema",
    path: path.join(
      repositoryRoot,
      "packages/contracts/schemas/portable-archive-manifest.v1.schema.json",
    ),
  },
  {
    exportName: "diagnosticEventV1JsonSchema",
    path: path.join(repositoryRoot, "packages/contracts/schemas/diagnostic-event.v1.schema.json"),
    source: "contracts",
  },
  {
    exportName: "supportBundleV1JsonSchema",
    path: path.join(repositoryRoot, "packages/contracts/schemas/support-bundle.v1.schema.json"),
    source: "contracts",
  },
  {
    exportName: "documentIrV1JsonSchema",
    path: path.join(repositoryRoot, "packages/documents/schemas/document-ir.v1.schema.json"),
    source: "documents",
  },
];

async function generatedSchemaText(schema, schemaPath) {
  const prettierConfig = await resolveConfig(schemaPath);
  return format(JSON.stringify(schema), {
    ...prettierConfig,
    filepath: schemaPath,
  });
}

async function checkSchema(schemaPath, expected) {
  let actual;
  try {
    actual = await readFile(schemaPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.error(
        `Generated JSON Schema is missing: ${path.relative(repositoryRoot, schemaPath)}`,
      );
      return 1;
    }
    throw error;
  }

  if (actual !== expected) {
    console.error(
      `Generated JSON Schema is stale: ${path.relative(repositoryRoot, schemaPath)}. Build @coredrill/contracts and run pnpm generate:contract-schemas.`,
    );
    return 1;
  }

  console.log(
    `Generated JSON Schema matches the Zod boundary contract: ${path.relative(repositoryRoot, schemaPath)}.`,
  );
  return 0;
}

const contracts = await import(pathToFileURL(contractsEntry).href);
const documents = await import(pathToFileURL(documentsEntry).href);
const sources = { contracts, documents };
let failed = false;
for (const generatedSchema of generatedSchemas) {
  const schema = sources[generatedSchema.source ?? "contracts"][generatedSchema.exportName];
  if (schema === undefined)
    throw new Error(`Missing contracts export ${generatedSchema.exportName}.`);
  const expected = await generatedSchemaText(schema, generatedSchema.path);
  if (process.argv.includes("--check")) {
    if ((await checkSchema(generatedSchema.path, expected)) !== 0) failed = true;
  } else {
    await mkdir(path.dirname(generatedSchema.path), { recursive: true });
    await writeFile(generatedSchema.path, expected, "utf8");
    console.log(`Generated ${path.relative(repositoryRoot, generatedSchema.path)}.`);
  }
}
if (failed) process.exitCode = 1;
