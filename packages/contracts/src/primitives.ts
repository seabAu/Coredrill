import * as z from "zod";

const LOWERCASE_UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_POINTER_PATTERN = new RegExp(
  String.raw`^(?!\s)(?![\s\S]*[\u0000-\u001f\u007f])[\s\S]*\S$`,
);
const SAFE_HTTP_URL_PATTERN = /^https?:\/\/(?![^/?#]*@)[^\s]+$/i;

export const uuidV7Schema = z.string().regex(LOWERCASE_UUID_V7_PATTERN);
export const instantSchema = z.iso.datetime({ offset: false, precision: 3 });
export const sha256Schema = z.string().regex(SHA_256_PATTERN);
type ValidatedJsonValue = z.infer<ReturnType<typeof z.json>>;

const hasJsonCycle = (value: ValidatedJsonValue): boolean => {
  const active = new WeakSet<object>();
  const stack: { value: ValidatedJsonValue; exit?: boolean }[] = [{ value }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current?.value === null || typeof current?.value !== "object") continue;
    if (current.exit) {
      active.delete(current.value);
      continue;
    }
    if (active.has(current.value)) return true;
    active.add(current.value);
    stack.push({ value: current.value, exit: true });
    for (const child of Object.values(current.value)) stack.push({ value: child });
  }
  return false;
};
const copyJsonTree = (value: ValidatedJsonValue): ValidatedJsonValue => {
  if (Array.isArray(value)) return value.map(copyJsonTree);
  if (value !== null && typeof value === "object")
    return Object.fromEntries<ValidatedJsonValue>(
      Object.entries(value).map(([key, child]) => [key, copyJsonTree(child)] as const),
    );
  return value;
};

// A validated serialized boundary owns a tree, not aliases to another field.
// Preserve scalars exactly; JSON stringify/parse would normalize negative zero.
export const jsonValueSchema = z
  .json()
  .refine((value) => !hasJsonCycle(value), {
    message: "JSON values cannot contain cycles.",
    abort: true,
  })
  .overwrite(copyJsonTree);

/** Keep a referenced JSON value's definition authoritative, without an inline duplicate. */
export const preserveJsonValueSchemaReference = ({
  zodSchema,
  jsonSchema,
}: {
  readonly zodSchema: unknown;
  readonly jsonSchema: { $ref?: string | undefined; anyOf?: unknown };
}): void => {
  if (zodSchema === jsonValueSchema && jsonSchema.$ref?.startsWith("#/$defs/"))
    delete jsonSchema.anyOf;
};

export const safeIdentifierSchema = z.string().max(128).regex(SAFE_IDENTIFIER_PATTERN);
export const semanticVersionSchema = z.string().max(64).regex(SEMVER_PATTERN);
export const sourcePointerSchema = z.string().max(2048).regex(SAFE_POINTER_PATTERN);
export const safeHttpUrlSchema = z.string().max(8192).regex(SAFE_HTTP_URL_PATTERN);

export type JsonValue = z.infer<typeof jsonValueSchema>;
