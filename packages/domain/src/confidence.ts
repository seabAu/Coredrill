import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";

export type Confidence = Brand<number, "confidence-0-to-1">;

export function confidence(value: number): Confidence {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DomainValidationError(
      "invalid_confidence",
      "Confidence must be a finite number from 0 through 1.",
    );
  }
  return (Object.is(value, -0) ? 0 : value) as Confidence;
}
