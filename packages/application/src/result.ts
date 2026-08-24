export const APPLICATION_ERROR_CODES = [
  "validation",
  "not_found",
  "conflict",
  "unavailable",
  "permission_denied",
  "cancelled",
  "rate_limited",
  "internal",
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export interface ApplicationError {
  readonly code: ApplicationErrorCode;
  /** Safe user-facing text; diagnostics use the stable code, never this free text. */
  readonly message: string;
  readonly retryable: boolean;
}

export type ApplicationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: ApplicationError };

export const applicationError = (input: ApplicationError): ApplicationError => {
  if (!APPLICATION_ERROR_CODES.includes(input.code)) {
    throw new TypeError("Application errors require a reviewed stable code.");
  }
  let hasControlCharacter = false;
  for (const character of input.message) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      hasControlCharacter = true;
      break;
    }
  }
  if (input.message.trim().length === 0 || hasControlCharacter) {
    throw new TypeError("Application error messages must be non-empty and control-free.");
  }
  return Object.freeze({
    code: input.code,
    message: input.message,
    retryable: input.retryable,
  });
};

export const applicationSuccess = <Value>(value: Value): ApplicationResult<Value> =>
  Object.freeze({ ok: true, value });

export const applicationFailure = <Value = never>(
  error: ApplicationError,
): ApplicationResult<Value> => Object.freeze({ ok: false, error: applicationError(error) });
