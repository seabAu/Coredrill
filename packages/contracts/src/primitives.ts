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
export const jsonValueSchema = z.json();

export const safeIdentifierSchema = z.string().max(128).regex(SAFE_IDENTIFIER_PATTERN);
export const semanticVersionSchema = z.string().max(64).regex(SEMVER_PATTERN);
export const sourcePointerSchema = z.string().max(2048).regex(SAFE_POINTER_PATTERN);
export const safeHttpUrlSchema = z.string().max(8192).regex(SAFE_HTTP_URL_PATTERN);

export type JsonValue = z.infer<typeof jsonValueSchema>;
