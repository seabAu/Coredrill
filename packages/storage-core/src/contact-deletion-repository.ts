import {
  ContactWorkspaceError,
  parseContactDeletionTargetV1,
  parseContactDeletionResultV1,
  type ContactDeletionPortV1,
  type ContactDeletionTargetV1,
  type ContactDeletionStateV1,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type DatabaseSession } from "./database-port.js";

type ReadSession = Pick<DatabaseSession, "query">;
const requireVault = async (session: ReadSession, target: ContactDeletionTargetV1) => {
  const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (roots.length > 1) throw new ContactWorkspaceError("invalid_state");
  if (roots[0]?.["id"] !== target.expectedVaultId) throw new ContactWorkspaceError("not_found");
};
const current = async (session: ReadSession, target: ContactDeletionTargetV1) => {
  const rows = await session.query(
    sqlStatement(
      `
    SELECT c.id,c.row_version,c.created_at,c.updated_at,c.archived_at,c.company_id,m.operation_id
    FROM contact c LEFT JOIN contact_manual_creation m ON m.contact_id=c.id
    WHERE c.id=? LIMIT 2`,
      [target.contactId],
    ),
  );
  if (rows.length > 1) throw new ContactWorkspaceError("invalid_state");
  const row = rows[0];
  if (row === undefined) return undefined;
  return parseContactDeletionTargetV1({
    specVersion: 1,
    expectedVaultId: target.expectedVaultId,
    contactId: row["id"],
    expectedRowVersion: row["row_version"],
    expectedCreatedAt: row["created_at"],
    expectedUpdatedAt: row["updated_at"],
    expectedArchivedAt: row["archived_at"],
    expectedCompanyId: row["company_id"],
    expectedManualCreationOperationId: row["operation_id"],
  });
};
// Both operands are copied by the same strict parser with the same complete key order.
const sameOriginal = (actual: ContactDeletionTargetV1, expected: ContactDeletionTargetV1) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const hasResiduals = async (
  session: ReadSession,
  target: ContactDeletionTargetV1,
): Promise<boolean> => {
  const rows = await session.query(
    sqlStatement(
      `
    SELECT (
      EXISTS(SELECT 1 FROM contact WHERE id=?) OR
      EXISTS(SELECT 1 FROM contact_manual_creation WHERE contact_id=?) OR
      EXISTS(SELECT 1 FROM contact_point_provenance WHERE contact_id=?) OR
      EXISTS(SELECT 1 FROM field_value WHERE entity_type='contact' AND entity_id=?) OR
      EXISTS(SELECT 1 FROM interaction WHERE contact_id=?) OR
      EXISTS(SELECT 1 FROM contact_field_use_review WHERE contact_id=?)
    ) AS residual`,
      Array.from({ length: 6 }, () => target.contactId),
    ),
  );
  const value = rows[0]?.["residual"];
  if (rows.length !== 1 || (value !== 0 && value !== 1))
    throw new ContactWorkspaceError("invalid_state");
  return value === 1;
};
const result = (target: ContactDeletionTargetV1, state: ContactDeletionStateV1) =>
  parseContactDeletionResultV1(
    { specVersion: 1, vaultId: target.expectedVaultId, contactId: target.contactId, state },
    target,
    [state],
  );

/** Explicit parent deletion only. Reconciliation is observational and never purges or attributes absence. */
export const createContactDeletionRepository = (database: DatabasePort): ContactDeletionPortV1 =>
  Object.freeze<ContactDeletionPortV1>({
    inspect: async (input) => {
      const target = parseContactDeletionTargetV1(input);
      const read = async (session: ReadSession) => {
        await requireVault(session, target);
        const found = await current(session, target);
        if (found !== undefined)
          return result(target, sameOriginal(found, target) ? "original_present" : "changed");
        return result(
          target,
          (await hasResiduals(session, target)) ? "unresolved" : "absent_complete",
        );
      };
      return database.withReadSnapshot === undefined
        ? database.transaction(read)
        : database.withReadSnapshot(read);
    },
    remove: async (input) => {
      const target = parseContactDeletionTargetV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, target);
        const found = await current(session, target);
        if (found === undefined) throw new ContactWorkspaceError("not_found");
        if (!sameOriginal(found, target)) throw new ContactWorkspaceError("stale");
        // Own replacement cycles are removed only inside the same complete deletion transaction.
        // Incoming references from other entities remain RESTRICT and roll back the entire operation.
        await session.execute(
          sqlStatement(
            "UPDATE field_value SET superseded_by_id=NULL WHERE entity_type='contact' AND entity_id=? AND superseded_by_id IS NOT NULL",
            [target.contactId],
          ),
        );
        await session.execute(
          sqlStatement("DELETE FROM field_value WHERE entity_type='contact' AND entity_id=?", [
            target.contactId,
          ]),
        );
        const removed = await session.execute(
          sqlStatement("DELETE FROM contact WHERE id=? AND row_version=?", [
            target.contactId,
            target.expectedRowVersion,
          ]),
        );
        if (removed.rowsAffected !== 1) throw new ContactWorkspaceError("stale");
        if (await hasResiduals(session, target)) throw new ContactWorkspaceError("invalid_state");
        return result(target, "deleted");
      });
    },
  });
