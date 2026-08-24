export const DOMAIN_VALIDATION_CODES = [
  "invalid_confidence",
  "invalid_currency",
  "invalid_date_only",
  "invalid_entity_id",
  "invalid_instant",
  "invalid_minor_units",
  "invalid_money_rate",
  "invalid_source_reference",
  "invalid_status_stage",
  "invalid_status_transition",
  "invalid_time_zone",
  "invalid_web_url",
] as const;

export type DomainValidationCode = (typeof DOMAIN_VALIDATION_CODES)[number];

export class DomainValidationError extends Error {
  readonly code: DomainValidationCode;

  constructor(code: DomainValidationCode, message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
  }
}
