import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";
import { hasControlCharacters } from "./text.js";

export type WebUrl = Brand<string, "absolute-http-url">;

/** Normalize a non-credentialed absolute HTTP(S) URL without fetching it. */
export function webUrl(value: string): WebUrl {
  if (value.length === 0 || value !== value.trim() || hasControlCharacters(value)) {
    throw new DomainValidationError("invalid_web_url", "URL must be a clean absolute HTTP(S) URL.");
  }

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      throw new DomainValidationError(
        "invalid_web_url",
        "URL must use HTTP(S), include a host, and exclude credentials.",
      );
    }
    return parsed.href as WebUrl;
  } catch (error) {
    if (error instanceof DomainValidationError) throw error;
    throw new DomainValidationError("invalid_web_url", "URL is not valid.");
  }
}
