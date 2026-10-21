import { entityId, instant } from "@coredrill/domain";
import {
  appendVaultExportObservation,
  BROWSER_EXPORT_REMINDER_SETTING_KEY,
  createDefaultBrowserExportReminderPreference,
  emptyVaultExportVerificationHistory,
  parseBrowserExportReminderPreference,
  parseVaultExportObservation,
  parseVaultExportVerificationHistory,
  serializeBrowserExportReminderPreference,
  serializeVaultExportVerificationHistory,
  updateBrowserExportReminderPreference,
  VAULT_EXPORT_VERIFICATION_SETTING_KEY,
  VaultExportVerificationError,
  type VaultExportVerificationPort,
  type VaultExportVerificationView,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type DatabaseSession } from "./database-port.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

const readView = async (
  session: DatabaseSession,
  vaultId: string,
): Promise<VaultExportVerificationView> => {
  const identities = await session.query(sqlStatement("SELECT id FROM vault ORDER BY id LIMIT 2"));
  if (identities.length === 0) throw new VaultExportVerificationError("not_found");
  if (identities.length !== 1 || identities[0]?.["id"] !== vaultId)
    throw new VaultExportVerificationError("conflict");
  const settings = createTrackerRepositories(session).settings;
  try {
    const storedHistory = await settings.get(VAULT_EXPORT_VERIFICATION_SETTING_KEY);
    const storedReminder = await settings.get(BROWSER_EXPORT_REMINDER_SETTING_KEY);
    const history =
      storedHistory === undefined
        ? emptyVaultExportVerificationHistory(vaultId)
        : parseVaultExportVerificationHistory(storedHistory.value);
    if (history.vaultId !== vaultId) throw new VaultExportVerificationError("conflict");
    return Object.freeze({
      history,
      reminder:
        storedReminder === undefined
          ? createDefaultBrowserExportReminderPreference()
          : parseBrowserExportReminderPreference(storedReminder.value),
    });
  } catch (error) {
    if (error instanceof VaultExportVerificationError && error.code === "conflict") throw error;
    throw new VaultExportVerificationError("unavailable");
  }
};
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const reminderAction = (value: unknown): "enable" | "disable" | "snooze" => {
  if (value !== "enable" && value !== "disable" && value !== "snooze")
    throw new VaultExportVerificationError("validation");
  return value;
};

/** Existing settings only; sole-vault checks and reminder/history writes share one transaction. */
export const createSqliteVaultExportVerificationPort = (
  database: DatabasePort,
): VaultExportVerificationPort =>
  Object.freeze<VaultExportVerificationPort>({
    read: async ({ vaultId }) => {
      const captured = entityId("vault", vaultId);
      return database.transaction((session) => readView(session, captured));
    },
    record: async ({ vaultId, observation, recordedAt }) => {
      const capturedVault = entityId("vault", vaultId);
      const captured = parseVaultExportObservation(observation);
      const updatedAt = instant(recordedAt);
      if (captured.verifiedAt > updatedAt) throw new VaultExportVerificationError("validation");
      return database.transaction(async (session) => {
        const current = await readView(session, capturedVault);
        const history = appendVaultExportObservation(current.history, captured);
        // An exact retry must not rewrite reminders changed deliberately afterward.
        if (equal(current.history, history)) return current;
        const verifiedAt = Math.max(
          current.reminder.lastSuccessfulExportAtUnixMs ?? 0,
          Date.parse(captured.verifiedAt),
        );
        const reminder = updateBrowserExportReminderPreference(
          current.reminder,
          "record-success",
          verifiedAt,
        );
        const settings = createTrackerRepositories(session).settings;
        await settings.put({
          key: VAULT_EXPORT_VERIFICATION_SETTING_KEY,
          value: serializeVaultExportVerificationHistory(history),
          updatedAt,
        });
        await settings.put({
          key: BROWSER_EXPORT_REMINDER_SETTING_KEY,
          value: serializeBrowserExportReminderPreference(reminder),
          updatedAt,
        });
        const stored = await readView(session, capturedVault);
        if (!equal(stored, { history, reminder }))
          throw new VaultExportVerificationError("unavailable");
        return stored;
      });
    },
    updateReminder: async ({ vaultId, action, updatedAt }) => {
      const capturedVault = entityId("vault", vaultId);
      const capturedAt = instant(updatedAt);
      const capturedAction = reminderAction(action);
      return database.transaction(async (session) => {
        const current = await readView(session, capturedVault);
        const reminder = updateBrowserExportReminderPreference(
          current.reminder,
          capturedAction,
          Date.parse(capturedAt),
        );
        await createTrackerRepositories(session).settings.put({
          key: BROWSER_EXPORT_REMINDER_SETTING_KEY,
          value: serializeBrowserExportReminderPreference(reminder),
          updatedAt: capturedAt,
        });
        const stored = await readView(session, capturedVault);
        if (!equal(stored.reminder, reminder))
          throw new VaultExportVerificationError("unavailable");
        return stored;
      });
    },
  });
