import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  [
    "assigned credential",
    /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?(?!placeholder\b|example\b|redacted\b|none\b|null\b|undefined\b|<|\$\{)[A-Za-z0-9+/_=-]{12,}/gi,
  ],
];

function gitExecutable() {
  return process.platform === "win32" ? "git.exe" : "git";
}

export function scanText(text) {
  const findings = [];
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ label, line });
    }
  }
  return findings;
}

export async function readFileIfPresent(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function scanRepository(repositoryRoot) {
  const listing = spawnSync(
    gitExecutable(),
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (listing.error) {
    throw new Error(`Unable to list repository files: ${listing.error.message}`);
  }
  if (listing.status !== 0) {
    throw new Error(`Unable to list repository files: ${(listing.stderr ?? "").trim()}`);
  }

  const findings = [];
  for (const relativePath of listing.stdout.split("\0").filter(Boolean)) {
    const buffer = await readFileIfPresent(path.join(repositoryRoot, relativePath));
    if (!buffer) continue;
    if (buffer.includes(0)) continue;
    const text = buffer.toString("utf8");
    for (const finding of scanText(text)) {
      findings.push({ ...finding, path: relativePath.split(path.sep).join("/") });
    }
  }
  return findings;
}

async function runCli() {
  const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());
  const findings = await scanRepository(repositoryRoot);
  if (findings.length > 0) {
    console.error(
      [
        "Potential secrets detected:",
        ...findings.map(({ label, line, path: filePath }) => `- ${filePath}:${line} (${label})`),
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  console.log("Secret-pattern scan passed for tracked and unignored workspace files.");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
