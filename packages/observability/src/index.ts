/** Privacy-safe local diagnostics with forbidden-content rules. */
export {
  createLocalDiagnosticEvent,
  redactDiagnosticAttributes,
  type DiagnosticRedactionResult,
  type LocalDiagnosticEventInput,
} from "./diagnostics.js";
export {
  createUserCopyableSupportBundle,
  type SupportBundleInput,
  type UserCopyableSupportBundle,
} from "./support-bundle.js";
