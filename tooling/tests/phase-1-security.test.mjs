import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const productionSourceRoots = [
  path.join(repositoryRoot, "apps", "extension", "entrypoints"),
  path.join(repositoryRoot, "apps", "extension", "src"),
  path.join(repositoryRoot, "apps", "web", "src"),
  path.join(repositoryRoot, "packages", "capture-core", "src"),
  path.join(repositoryRoot, "packages", "documents", "src"),
  path.join(repositoryRoot, "packages", "extension-bridge", "src"),
  path.join(repositoryRoot, "packages", "ui", "src"),
];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const forbiddenDomSinks = [
  ["React raw-HTML sink", /\bdangerouslySetInnerHTML\b/u],
  ["innerHTML assignment", /\.innerHTML\s*=/u],
  ["outerHTML assignment", /\.outerHTML\s*=/u],
  ["HTML insertion", /\binsertAdjacentHTML\s*\(/u],
  ["document.write", /\bdocument\.write\s*\(/u],
  ["dynamic eval", /\beval\s*\(/u],
  ["dynamic Function", /\bnew\s+Function\s*\(/u],
];

const collectSourceFiles = async (root) => {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await collectSourceFiles(entryPath)));
    else if (sourceExtensions.has(path.extname(entry.name))) output.push(entryPath);
  }
  return output;
};

describe("Phase 1 browser and native security policy", () => {
  it("keeps executable UI sources free of raw HTML and dynamic-code sinks", async () => {
    const findings = [];
    for (const root of productionSourceRoots) {
      for (const filePath of await collectSourceFiles(root)) {
        const source = await readFile(filePath, "utf8");
        for (const [label, pattern] of forbiddenDomSinks) {
          if (pattern.test(source)) {
            findings.push(`${path.relative(repositoryRoot, filePath)}: ${label}`);
          }
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it("keeps browser entry documents on local module scripts without inline handlers", async () => {
    const webRoot = path.join(repositoryRoot, "apps", "web");
    const htmlFiles = (await readdir(webRoot)).filter((name) => name.endsWith(".html")).sort();
    expect(htmlFiles.length).toBeGreaterThan(0);

    for (const name of htmlFiles) {
      const source = await readFile(path.join(webRoot, name), "utf8");
      expect(source, `${name} contains an inline event handler`).not.toMatch(/\son[a-z]+\s*=/iu);
      const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)];
      expect(scripts.length, `${name} must retain a local module entry`).toBeGreaterThan(0);
      for (const script of scripts) {
        expect(script[1], `${name} script must be a module`).toMatch(/\btype=["']module["']/iu);
        expect(script[1], `${name} script must use a local source`).toMatch(
          /\bsrc=["']\/src\/[A-Za-z0-9._/-]+["']/u,
        );
        expect(script[1], `${name} script source must not be remote`).not.toMatch(/https?:/iu);
        expect(script[2]?.trim(), `${name} script body must be empty`).toBe("");
      }
    }
  });

  it("retains the exact local-only Tauri window, CSP, and command capability", async () => {
    const tauriRoot = path.join(repositoryRoot, "apps", "desktop", "src-tauri");
    const [config, capability, cargoManifest] = await Promise.all([
      readFile(path.join(tauriRoot, "tauri.conf.json"), "utf8").then(JSON.parse),
      readFile(path.join(tauriRoot, "capabilities", "main.json"), "utf8").then(JSON.parse),
      readFile(path.join(tauriRoot, "Cargo.toml"), "utf8"),
    ]);

    expect(config.app.withGlobalTauri).toBe(false);
    expect(config.app.security.freezePrototype).toBe(true);
    expect(config.app.windows).toEqual([
      expect.objectContaining({ label: "main", dragDropEnabled: false }),
    ]);
    expect(config.app.security.csp).toEqual({
      "default-src": "'self'",
      "connect-src": "ipc: http://ipc.localhost",
      "font-src": "'self'",
      "img-src": "'self' data:",
      "object-src": "'none'",
      "style-src": "'self'",
    });
    expect(JSON.stringify(config.app.security.csp)).not.toMatch(
      /unsafe-eval|unsafe-inline|https:|wss:/iu,
    );
    expect(capability).toMatchObject({
      local: true,
      windows: ["main"],
      permissions: [
        "allow-native-storage-invoke",
        "allow-native-secret-invoke",
        "allow-native-archive-invoke",
        "allow-native-vault-invoke",
      ],
    });
    expect(capability.permissions).toHaveLength(4);
    expect(cargoManifest).not.toMatch(/tauri-plugin-(?:fs|http|opener|shell)|loadable_extension/iu);
  });
});
