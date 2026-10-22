import {
  CONTACT_PROVENANCE_FIELDS,
  ContactWorkspaceError,
  contactFieldValues,
  parseContactWorkspaceV1,
  parseCreateViewedContactPortInputV1,
  parseReadContactWorkspaceRequestV1,
  parseUpdateContactNotesPortInputV1,
  resolveContactManualFieldsV1,
  validateCreatedContactWorkspaceV1,
  validateUpdatedContactNotesV1,
  type ContactWorkspacePortV1,
  type ContactWorkspaceV1,
} from "@coredrill/application";
import { sqlStatement, type DatabasePort, type DatabaseSession } from "./database-port.js";
import { CompanyRepository, ContactRepository } from "./tracker-repositories.js";

const requireVault = async (session: DatabaseSession, expectedVaultId: string): Promise<void> => {
  const roots = await session.query(sqlStatement("SELECT id FROM vault LIMIT 2"));
  if (roots.length > 1) throw new ContactWorkspaceError("invalid_state");
  if (roots[0]?.["id"] !== expectedVaultId) throw new ContactWorkspaceError("not_found");
};
const selected = async (
  session: DatabaseSession,
  expectedVaultId: ContactWorkspaceV1["vaultId"],
  contactId: ContactWorkspaceV1["contact"]["id"],
  includeArchived: boolean,
): Promise<ContactWorkspaceV1 | undefined> => {
  const contact = await new ContactRepository(session).findById(contactId);
  if (contact === undefined || (!includeArchived && contact.archivedAt !== null)) return undefined;
  const receipts = await session.query(
    sqlStatement(
      `SELECT operation_id, created_at, name_hash, role_hash, email_hash, phone_hash, public_profile_url_hash
     FROM contact_manual_creation WHERE contact_id = ? LIMIT 2`,
      [contactId],
    ),
  );
  if (receipts.length > 1) throw new ContactWorkspaceError("invalid_state");
  const row = receipts[0];
  return parseContactWorkspaceV1(
    {
      specVersion: 1,
      vaultId: expectedVaultId,
      contact,
      manualCreation:
        row === undefined
          ? null
          : {
              operationId: row["operation_id"],
              createdAt: row["created_at"],
              valueHashes: {
                name: row["name_hash"],
                role: row["role_hash"],
                email: row["email_hash"],
                phone: row["phone_hash"],
                public_profile_url: row["public_profile_url_hash"],
              },
            },
    },
    { expectedVaultId, contactId, includeArchived },
  );
};

/** Selected reads only. The directory never preloads methods, notes or receipt hashes. */
export const createContactWorkspaceRepository = (
  database: DatabasePort,
  hashValue: (value: string) => Promise<string>,
): ContactWorkspacePortV1 => {
  if (typeof hashValue !== "function")
    throw new TypeError("Contact storage requires a local hasher.");
  return Object.freeze<ContactWorkspacePortV1>({
    read: async (input) => {
      const request = parseReadContactWorkspaceRequestV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        return selected(
          session,
          request.expectedVaultId,
          request.contactId,
          request.includeArchived,
        );
      });
    },
    create: async (input) => {
      const request = parseCreateViewedContactPortInputV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        const repository = new ContactRepository(session);
        if (await repository.findById(request.contact.id)) throw new ContactWorkspaceError("stale");
        const previousIntent = await session.query(
          sqlStatement(
            "SELECT contact_id FROM contact_manual_creation WHERE operation_id = ? LIMIT 1",
            [request.manualCreation.operationId],
          ),
        );
        if (previousIntent.length !== 0) throw new ContactWorkspaceError("stale");
        if (request.contact.companyId !== null) {
          const company = await new CompanyRepository(session).findById(request.contact.companyId);
          if (company === undefined) throw new ContactWorkspaceError("not_found");
          if (
            company.archivedAt !== null ||
            company.rowVersion !== request.expectedCompanyRowVersion ||
            request.contact.createdAt < company.createdAt
          )
            throw new ContactWorkspaceError("stale");
        }
        // Recompute independently inside the write transaction before any canonical effect.
        const matching = await resolveContactManualFieldsV1(
          {
            specVersion: 1,
            vaultId: request.expectedVaultId,
            contact: { ...request.contact, rowVersion: 1 },
            manualCreation: request.manualCreation,
          },
          hashValue,
        );
        const values = contactFieldValues(request.contact);
        if (
          CONTACT_PROVENANCE_FIELDS.some(
            (field) => values[field] !== null && !matching.includes(field),
          )
        )
          throw new ContactWorkspaceError("invalid_state");
        await repository.create(request.contact);
        const hashes = request.manualCreation.valueHashes;
        const inserted = await session.execute(
          sqlStatement(
            `INSERT INTO contact_manual_creation(contact_id, operation_id, created_at,
             name_hash, role_hash, email_hash, phone_hash, public_profile_url_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              request.contact.id,
              request.manualCreation.operationId,
              request.manualCreation.createdAt,
              hashes.name,
              hashes.role,
              hashes.email,
              hashes.phone,
              hashes.public_profile_url,
            ],
          ),
        );
        if (inserted.rowsAffected !== 1) throw new ContactWorkspaceError("invalid_state");
        await requireVault(session, request.expectedVaultId);
        return validateCreatedContactWorkspaceV1(
          await selected(session, request.expectedVaultId, request.contact.id, false),
          request,
        );
      });
    },
    updateNotes: async (input) => {
      const request = parseUpdateContactNotesPortInputV1(input);
      return database.transaction(async (session) => {
        await requireVault(session, request.expectedVaultId);
        const before = await selected(session, request.expectedVaultId, request.contactId, true);
        if (before === undefined) throw new ContactWorkspaceError("not_found");
        if (
          before.contact.archivedAt !== null ||
          before.contact.rowVersion !== request.expectedRowVersion ||
          request.updatedAt < before.contact.updatedAt
        )
          throw new ContactWorkspaceError("stale");
        const changed = await session.execute(
          sqlStatement(
            `UPDATE contact SET notes = ?, updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ? AND archived_at IS NULL`,
            [request.notes, request.updatedAt, request.contactId, request.expectedRowVersion],
          ),
        );
        if (changed.rowsAffected !== 1) throw new ContactWorkspaceError("stale");
        await requireVault(session, request.expectedVaultId);
        const after = validateUpdatedContactNotesV1(
          await selected(session, request.expectedVaultId, request.contactId, false),
          request,
        );
        for (const key of [
          "id",
          "companyId",
          "name",
          "role",
          "email",
          "phone",
          "publicProfileUrl",
          "confidence",
          "userConfirmed",
          "archivedAt",
          "createdAt",
        ] as const)
          if (before.contact[key] !== after.contact[key])
            throw new ContactWorkspaceError("invalid_state");
        if (
          before.manualCreation?.operationId !== after.manualCreation?.operationId ||
          before.manualCreation?.createdAt !== after.manualCreation?.createdAt ||
          CONTACT_PROVENANCE_FIELDS.some(
            (field) =>
              before.manualCreation?.valueHashes[field] !==
              after.manualCreation?.valueHashes[field],
          )
        )
          throw new ContactWorkspaceError("invalid_state");
        return after;
      });
    },
  });
};
