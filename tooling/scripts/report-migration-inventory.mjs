import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationRoot = path.resolve("migrations");
const files = (await readdir(migrationRoot))
  .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
  .sort();

for (const [index, fileName] of files.entries()) {
  const version = Number(fileName.slice(0, 4));
  if (version !== index + 1) throw new Error("Migration versions are not contiguous.");
  const sql = await readFile(path.join(migrationRoot, fileName));
  const sha256 = createHash("sha256").update(sql).digest("hex");
  console.log(`${String(version)}|${fileName}|${sha256}`);
}
