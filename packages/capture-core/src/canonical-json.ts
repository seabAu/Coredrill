const objectPrototype = Object.prototype;

export function canonicalJsonStringify(value: unknown): string {
  const ancestors = new Set<object>();

  const encode = (candidate: unknown): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string" || typeof candidate === "boolean") {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate))
        throw new TypeError("Canonical JSON requires finite numbers.");
      return JSON.stringify(candidate);
    }
    if (typeof candidate !== "object") {
      throw new TypeError("Canonical JSON accepts only JSON values.");
    }
    if (ancestors.has(candidate)) throw new TypeError("Canonical JSON cannot contain cycles.");

    ancestors.add(candidate);
    let result: string;
    if (Array.isArray(candidate)) {
      result = `[${candidate.map((item) => encode(item)).join(",")}]`;
    } else {
      const prototype = Object.getPrototypeOf(candidate) as object | null;
      if (prototype !== objectPrototype && prototype !== null) {
        throw new TypeError("Canonical JSON requires plain objects.");
      }
      const record = candidate as Record<string, unknown>;
      result = `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
        .join(",")}}`;
    }
    ancestors.delete(candidate);
    return result;
  };

  return encode(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonStringify(value));
}
