import type { VaultDiagnosticsDto } from "@coredrill/application";
import type { VaultHealthState } from "@coredrill/ui";

export const storedVaultHealth = (diagnostics: VaultDiagnosticsDto): VaultHealthState => {
  if (diagnostics.health === "unavailable" || diagnostics.readOnly) return "storage-risk";
  if (diagnostics.issueCodes.includes("schema-mismatch")) return "migration-required";
  if (
    diagnostics.health !== "ready" ||
    diagnostics.persistence !== "durable" ||
    diagnostics.issueCodes.length !== 0
  )
    return "storage-risk";
  return "healthy";
};
