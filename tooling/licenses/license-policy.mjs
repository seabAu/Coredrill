const allowed = new Set([
  "0BSD",
  "Apache-2.0",
  "Artistic-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
]);

/** Bounded SPDX AND/OR subset. Unknown obligations and WITH exceptions fail closed. */
export const isAllowedExpression = (value) => {
  if (Array.isArray(value))
    return value.length > 0 && value.length <= 16 && value.every(isAllowedExpression);
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  const tokens = value.match(/\(|\)|[A-Za-z0-9.+-]+/gu) ?? [];
  if (tokens.length === 0 || tokens.length > 128 || tokens.join("") !== value.replace(/\s/gu, ""))
    return false;
  let position = 0;
  const primary = () => {
    const token = tokens[position++];
    if (token === "(") {
      const result = disjunction();
      if (tokens[position++] !== ")") throw new Error("Invalid license expression.");
      return result;
    }
    if (token === undefined || ["AND", "OR", "WITH", ")"].includes(token))
      throw new Error("Invalid license expression.");
    return allowed.has(token);
  };
  const conjunction = () => {
    let result = primary();
    while (tokens[position] === "AND") {
      position += 1;
      const right = primary();
      result = result && right;
    }
    return result;
  };
  const disjunction = () => {
    let result = conjunction();
    while (tokens[position] === "OR") {
      position += 1;
      const right = conjunction();
      result = result || right;
    }
    return result;
  };
  try {
    const result = disjunction();
    return position === tokens.length && result;
  } catch {
    return false;
  }
};

/** Legacy metadata is not an exemption: only exact reviewed file bytes qualify. */
export const reviewedLegacyLicense = (name, reported, licenseSha256) =>
  name === "duck@0.1.12" &&
  reported === "UNKNOWN" &&
  licenseSha256 === "6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1"
    ? "BSD-2-Clause"
    : reported;
