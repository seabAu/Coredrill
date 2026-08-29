export const packageBoundaries = Object.freeze({
  domain: [],
  contracts: [],
  application: ["contracts", "domain"],
  ui: ["application", "contracts", "domain"],
  "storage-core": ["application", "contracts", "domain"],
  "storage-browser": ["contracts", "domain", "storage-core"],
  "storage-native": ["contracts", "domain", "storage-core"],
  "capture-core": ["contracts", "domain"],
  extractors: ["capture-core", "contracts", "source-policy"],
  "extension-bridge": ["capture-core", "contracts"],
  "career-evidence": ["contracts", "domain"],
  "prompt-engine": ["career-evidence", "contracts", "domain"],
  "ai-adapters": ["application", "contracts", "domain", "prompt-engine"],
  "labor-data": ["contracts", "domain", "source-policy"],
  documents: ["contracts", "domain"],
  "source-policy": ["contracts", "domain"],
  "search-filter": ["application", "contracts", "domain", "storage-core"],
  observability: ["contracts"],
  "test-fixtures": [],
});

export const workspacePackagePrefix = "@coredrill/";
