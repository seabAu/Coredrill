import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { packageBoundaries, workspacePackagePrefix } from "./package-boundaries.mjs";

const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const importPattern =
  /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function walkSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSourceFiles(candidate)));
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(candidate);
    }
  }

  return files;
}

function workspaceTarget(specifier) {
  if (!specifier.startsWith(workspacePackagePrefix)) return undefined;
  return specifier.slice(workspacePackagePrefix.length).split("/", 1)[0];
}

function relativeWorkspaceTarget(specifier, sourceFile, packagesDirectory) {
  if (!specifier.startsWith(".")) return undefined;
  const resolved = path.resolve(path.dirname(sourceFile), specifier);
  const relative = path.relative(packagesDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep, 1)[0];
}

function packageDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
}

function formatPath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

export async function checkWorkspace(repositoryRoot) {
  const packagesDirectory = path.join(repositoryRoot, "packages");
  const packageEntries = await readdir(packagesDirectory, { withFileTypes: true });
  const actualPackages = packageEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => Object.hasOwn(packageBoundaries, name))
    .sort();
  const issues = [];

  for (const packageName of actualPackages) {
    const packageDirectory = path.join(packagesDirectory, packageName);
    const manifestPath = path.join(packageDirectory, "package.json");
    const manifest = await readJson(manifestPath);
    const allowed = new Set(packageBoundaries[packageName]);
    const declared = packageDependencies(manifest);

    if (manifest.name !== `${workspacePackagePrefix}${packageName}`) {
      issues.push(
        `${formatPath(repositoryRoot, manifestPath)}: package name must be ${workspacePackagePrefix}${packageName}`,
      );
    }

    for (const dependency of declared) {
      const target = workspaceTarget(dependency);
      if (target && target !== packageName && !allowed.has(target)) {
        issues.push(
          `${formatPath(repositoryRoot, manifestPath)}: forbidden manifest edge ${packageName} -> ${target}`,
        );
      }
      if (target === "test-fixtures" && packageName !== "test-fixtures") {
        issues.push(
          `${formatPath(repositoryRoot, manifestPath)}: production package cannot depend on test-fixtures`,
        );
      }
    }

    const tsconfig = await readJsonIfPresent(path.join(packageDirectory, "tsconfig.json"));
    for (const reference of tsconfig?.references ?? []) {
      if (typeof reference.path !== "string") continue;
      const target = path.basename(reference.path);
      if (target !== packageName && !allowed.has(target)) {
        issues.push(
          `${formatPath(repositoryRoot, path.join(packageDirectory, "tsconfig.json"))}: forbidden TypeScript reference ${packageName} -> ${target}`,
        );
      }
      if (!declared.has(`${workspacePackagePrefix}${target}`)) {
        issues.push(
          `${formatPath(repositoryRoot, path.join(packageDirectory, "tsconfig.json"))}: TypeScript reference ${target} lacks a declared workspace dependency`,
        );
      }
    }

    const sourceDirectory = path.join(packageDirectory, "src");
    for (const sourceFile of await walkSourceFiles(sourceDirectory)) {
      const source = await readFile(sourceFile, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? match[2];
        const target =
          workspaceTarget(specifier) ??
          relativeWorkspaceTarget(specifier, sourceFile, packagesDirectory);
        if (!target || target === packageName) continue;

        if (!allowed.has(target)) {
          issues.push(
            `${formatPath(repositoryRoot, sourceFile)}: forbidden import ${packageName} -> ${target} (${specifier})`,
          );
        } else if (!declared.has(`${workspacePackagePrefix}${target}`)) {
          issues.push(
            `${formatPath(repositoryRoot, sourceFile)}: import ${packageName} -> ${target} lacks a declared workspace dependency`,
          );
        }
      }
    }
  }

  return issues.sort();
}

export async function runCli(repositoryRoot = path.resolve(process.argv[2] ?? process.cwd())) {
  const issues = await checkWorkspace(repositoryRoot);
  if (issues.length > 0) {
    console.error(
      ["Import-boundary check failed:", ...issues.map((issue) => `- ${issue}`)].join("\n"),
    );
    return 1;
  }
  console.log(
    `Import-boundary check passed for ${Object.keys(packageBoundaries).length} package policies.`,
  );
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
/* v8 ignore next -- the CLI body is tested directly; this only detects the Node entry point. */
if (invokedPath === import.meta.url) process.exitCode = await runCli();
