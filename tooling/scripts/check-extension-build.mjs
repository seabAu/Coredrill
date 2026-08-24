import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scanText } from "./check-secrets.mjs";

const commonManifestKeys = [
  "action",
  "background",
  "content_security_policy",
  "description",
  "host_permissions",
  "incognito",
  "manifest_version",
  "name",
  "optional_host_permissions",
  "optional_permissions",
  "permissions",
  "version",
];
const phase0AppOriginPattern = "https://app.coredrill.test/*";

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

async function listFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return files.sort(compareText);
}

async function fileRecord(root, relativePath) {
  const absolute = path.join(root, ...relativePath.split("/"));
  const [contents, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
  return {
    path: relativePath,
    bytes: metadata.size,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

export async function inspectExtensionBuild(buildRoot, requestedTarget) {
  const target =
    requestedTarget ??
    (path.basename(buildRoot).startsWith("firefox-") ? "firefox-mv3" : "chrome-mv3");
  assert(
    target === "chrome-mv3" || target === "firefox-mv3",
    "Extension inspector target is unsupported.",
  );
  const isFirefox = target === "firefox-mv3";
  const expectedPermissions = isFirefox
    ? ["activeTab", "scripting", "storage"]
    : ["activeTab", "scripting", "sidePanel", "storage"];
  const expectedManifestKeys = [
    ...commonManifestKeys,
    ...(isFirefox
      ? ["browser_specific_settings", "sidebar_action"]
      : ["externally_connectable", "side_panel"]),
  ];
  const manifestPath = path.join(buildRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert(
    exactKeys(manifest, expectedManifestKeys),
    "Production manifest contains unexpected keys.",
  );
  assert(manifest.manifest_version === 3, "Extension must build as Manifest V3.");
  assert(manifest.name === "Coredrill Capture", "Extension identity drifted.");
  assert(manifest.incognito === "not_allowed", "Incognito capture must remain disabled.");
  assert(
    JSON.stringify([...manifest.permissions].sort(compareText)) ===
      JSON.stringify(expectedPermissions),
    "Extension permissions are not the exact reviewed set.",
  );
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions"]) {
    assert(Array.isArray(manifest[key]) && manifest[key].length === 0, `${key} must remain empty.`);
  }
  if (isFirefox) {
    assert(
      exactKeys(manifest.background, ["scripts"]) &&
        JSON.stringify(manifest.background.scripts) === JSON.stringify(["background.js"]),
      "Firefox manifest must contain only the reviewed background script.",
    );
  } else {
    assert(
      exactKeys(manifest.background, ["service_worker"]) &&
        manifest.background.service_worker === "background.js",
      "Chromium manifest must contain only the reviewed service worker.",
    );
  }
  assert(
    exactKeys(manifest.action, ["default_popup", "default_title"]) &&
      manifest.action.default_popup === "popup.html",
    "Popup fallback entrypoint is missing or changed.",
  );
  if (isFirefox) {
    assert(
      exactKeys(manifest.sidebar_action, ["default_panel", "default_title"]) &&
        manifest.sidebar_action.default_panel === "sidepanel.html",
      "Firefox sidebar entrypoint is missing or changed.",
    );
    assert(
      exactKeys(manifest.browser_specific_settings, ["gecko"]) &&
        exactKeys(manifest.browser_specific_settings.gecko, [
          "data_collection_permissions",
          "id",
        ]) &&
        manifest.browser_specific_settings.gecko.id === "capture@coredrill.local" &&
        exactKeys(manifest.browser_specific_settings.gecko.data_collection_permissions, [
          "required",
        ]) &&
        JSON.stringify(
          manifest.browser_specific_settings.gecko.data_collection_permissions.required,
        ) === JSON.stringify(["none"]),
      "Firefox identity or no-data-collection declaration drifted.",
    );
  } else {
    assert(
      exactKeys(manifest.side_panel, ["default_path"]) &&
        manifest.side_panel.default_path === "sidepanel.html",
      "Chromium side-panel entrypoint is missing or changed.",
    );
    assert(
      exactKeys(manifest.externally_connectable, ["matches"]) &&
        JSON.stringify(manifest.externally_connectable.matches) ===
          JSON.stringify([phase0AppOriginPattern]),
      "Chromium external messaging must name only the exact Phase 0 app origin.",
    );
  }
  assert(
    exactKeys(manifest.content_security_policy, ["extension_pages"]) &&
      manifest.content_security_policy.extension_pages === "script-src 'self'; object-src 'self';",
    "Extension CSP is not the exact self-only policy.",
  );
  for (const forbiddenKey of ["content_scripts", "web_accessible_resources"]) {
    assert(!(forbiddenKey in manifest), `Manifest must not include ${forbiddenKey}.`);
  }
  if (isFirefox) {
    assert(
      !("externally_connectable" in manifest),
      "Firefox must use the reviewed manual fallback without an external-message match.",
    );
  }

  const files = await listFiles(buildRoot);
  for (const required of ["manifest.json", "background.js", "popup.html", "sidepanel.html"]) {
    assert(files.includes(required), `Built extension is missing ${required}.`);
  }
  for (const htmlPath of ["popup.html", "sidepanel.html"]) {
    const html = await readFile(path.join(buildRoot, htmlPath), "utf8");
    assert(!/(?:src|href)=["'](?:https?:|\/\/)/i.test(html), `${htmlPath} loads a remote asset.`);
    assert(!/<script[^>]+src=["'](?!\/|\.\/)/i.test(html), `${htmlPath} has a nonlocal script.`);
  }
  for (const relativePath of files.filter((file) => file.endsWith(".js"))) {
    const source = await readFile(path.join(buildRoot, ...relativePath.split("/")), "utf8");
    assert(!/\beval\s*\(/.test(source), `${relativePath} contains eval().`);
    assert(
      !/\bimportScripts\s*\(\s*["'](?:https?:|\/\/)/i.test(source),
      `${relativePath} imports remote executable code.`,
    );
  }
  const textFiles = files.filter((file) => /\.(?:css|html|js|json)$/u.test(file));
  for (const relativePath of textFiles) {
    const source = await readFile(path.join(buildRoot, ...relativePath.split("/")), "utf8");
    assert(scanText(source).length === 0, `${relativePath} contains a potential secret.`);
  }

  return {
    schemaVersion: 1,
    target,
    permissions: expectedPermissions,
    hostPermissions: [],
    entrypoints: {
      background: isFirefox ? manifest.background.scripts[0] : manifest.background.service_worker,
      popup: manifest.action.default_popup,
      sidePanel: isFirefox
        ? manifest.sidebar_action.default_panel
        : manifest.side_panel.default_path,
    },
    transfer: isFirefox
      ? { mode: "manual-json-export-import", allowedOrigins: [] }
      : { mode: "external-message", allowedOrigins: [phase0AppOriginPattern] },
    contentSecurityPolicy: manifest.content_security_policy.extension_pages,
    remoteCodeScan: { remoteAssets: 0, remoteImports: 0, evalCalls: 0 },
    secretScan: { scannedTextFiles: textFiles.length, findings: 0 },
    files: await Promise.all(files.map((relativePath) => fileRecord(buildRoot, relativePath))),
  };
}

async function runCli() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (process.argv[2] !== undefined) {
    const buildRoot = path.resolve(process.argv[2]);
    const result = await inspectExtensionBuild(buildRoot, process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const results = await Promise.all(
    ["chrome-mv3", "firefox-mv3"].map((target) =>
      inspectExtensionBuild(
        path.join(repositoryRoot, "apps", "extension", ".output", target),
        target,
      ),
    ),
  );
  console.log(JSON.stringify({ schemaVersion: 1, results }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await runCli();
