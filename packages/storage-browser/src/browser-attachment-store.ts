import {
  createPortableRestoreTargetFingerprintV1,
  type PortableArchiveRestoreAttachmentV1,
  type PortableArchiveRestoreCommitPayloadV1,
  type PortableArchiveRestorePortV1,
  type PortableArchiveRestoreTargetSnapshotV1,
  type PortableDatabase,
  type QueryRow,
  sqlStatement,
} from "@coredrill/storage-core";

import type { BrowserSqliteDatabase } from "./browser-sqlite.js";

const ROOT_DIRECTORY = "coredrill";
const ATTACHMENT_DIRECTORY = "attachments";
const HASH_DIRECTORY = "sha256";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

interface VaultIdentityRow extends QueryRow {
  readonly id: string;
}

interface AttachmentManifestRow extends QueryRow {
  readonly content_id: string;
  readonly byte_length: number;
}

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const validateContentId = (contentId: string): void => {
  if (!SHA256_PATTERN.test(contentId)) {
    throw new TypeError("Attachment content IDs must be lowercase SHA-256 values.");
  }
};

const fileBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.arrayBuffer());

/**
 * Browser-owned immutable attachment bytes. SQLite retains the manifest and
 * relationships; OPFS retains only content-addressed payloads.
 */
export class BrowserAttachmentStore {
  private constructor(private root: FileSystemDirectoryHandle) {}

  public static async open(): Promise<BrowserAttachmentStore> {
    const storageRoot = await navigator.storage.getDirectory();
    const coredrillRoot = await storageRoot.getDirectoryHandle(ROOT_DIRECTORY, { create: true });
    const attachmentRoot = await coredrillRoot.getDirectoryHandle(ATTACHMENT_DIRECTORY, {
      create: true,
    });
    const hashRoot = await attachmentRoot.getDirectoryHandle(HASH_DIRECTORY, { create: true });
    return new BrowserAttachmentStore(hashRoot);
  }

  public async read(contentId: string): Promise<Uint8Array | undefined> {
    validateContentId(contentId);
    try {
      const shard = await this.shard(contentId, false);
      const handle = await shard.getFileHandle(contentId);
      return await fileBytes(await handle.getFile());
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
      throw error;
    }
  }

  public async put(input: {
    readonly contentId: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly bytes: Uint8Array;
  }): Promise<void> {
    validateContentId(input.contentId);
    if (
      input.sha256 !== input.contentId ||
      !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 0 ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength !== input.byteLength ||
      (await sha256(input.bytes)) !== input.contentId
    ) {
      throw new TypeError("Attachment bytes do not match their content-addressed manifest.");
    }

    const existing = await this.read(input.contentId);
    if (existing?.byteLength === input.byteLength && (await sha256(existing)) === input.contentId) {
      return;
    }

    const shard = await this.shard(input.contentId, true);
    const handle = await shard.getFileHandle(input.contentId, { create: true });
    const writable = await handle.createWritable({ keepExistingData: false });
    try {
      await writable.write(input.bytes.slice());
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
    const stored = await fileBytes(await handle.getFile());
    if (stored.byteLength !== input.byteLength || (await sha256(stored)) !== input.contentId) {
      throw new Error("The browser attachment did not remain intact after its durable write.");
    }
  }

  public async putAll(attachments: readonly PortableArchiveRestoreAttachmentV1[]): Promise<void> {
    for (const attachment of attachments) await this.put(attachment);
  }

  public async deleteAll(): Promise<void> {
    const coredrillRoot = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle(ROOT_DIRECTORY, { create: true });
    await coredrillRoot
      .removeEntry(ATTACHMENT_DIRECTORY, { recursive: true })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      });
    const attachmentRoot = await coredrillRoot.getDirectoryHandle(ATTACHMENT_DIRECTORY, {
      create: true,
    });
    this.root = await attachmentRoot.getDirectoryHandle(HASH_DIRECTORY, { create: true });
  }

  private async shard(contentId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const first = await this.root.getDirectoryHandle(contentId.slice(0, 2), { create });
    return first.getDirectoryHandle(contentId.slice(2, 4), { create });
  }
}

interface BrowserPortableRestoreState {
  readonly portable: PortableDatabase;
  readonly target: PortableArchiveRestoreTargetSnapshotV1;
}

const inspectBrowserPortableRestoreState = async (
  database: BrowserSqliteDatabase,
  attachments: BrowserAttachmentStore,
): Promise<BrowserPortableRestoreState> => {
  const portable = await database.exportPortable();
  const vaultRows = await database.query<VaultIdentityRow>(
    sqlStatement("SELECT id FROM vault ORDER BY id"),
  );
  const manifestRows = await database.query<AttachmentManifestRow>(
    sqlStatement("SELECT content_id, byte_length FROM attachment_manifest ORDER BY content_id"),
  );
  if (vaultRows.length === 0) {
    if (manifestRows.length !== 0)
      throw new Error("An empty browser target retained attachment rows.");
    return Object.freeze({
      portable,
      target: Object.freeze({
        state: "empty" as const,
        fingerprint: await createPortableRestoreTargetFingerprintV1(portable.sha256, []),
        attachmentContentIds: Object.freeze([] as const),
      }),
    });
  }
  const vault = vaultRows[0];
  if (vaultRows.length !== 1 || vault === undefined) {
    throw new Error("The browser portable target must contain exactly one vault.");
  }
  const contentIds: string[] = [];
  for (const row of manifestRows) {
    validateContentId(row.content_id);
    const bytes = await attachments.read(row.content_id);
    if (bytes?.byteLength !== row.byte_length || (await sha256(bytes)) !== row.content_id) {
      throw new Error("The browser portable target has a missing or corrupt attachment.");
    }
    contentIds.push(row.content_id);
  }
  return Object.freeze({
    portable,
    target: Object.freeze({
      state: "present" as const,
      fingerprint: await createPortableRestoreTargetFingerprintV1(portable.sha256, contentIds),
      vaultId: vault.id,
      schemaVersion: portable.schemaVersion,
      databaseSha256: portable.sha256,
      attachmentContentIds: Object.freeze(contentIds),
    }),
  });
};

/** Production browser composition for the shared preview/commit coordinator. */
export const createBrowserPortableArchiveRestorePortV1 = (input: {
  readonly database: BrowserSqliteDatabase;
  readonly attachments: BrowserAttachmentStore;
  readonly expectedVaultId: string;
}): PortableArchiveRestorePortV1 =>
  Object.freeze({
    inspectTarget: async () =>
      (await inspectBrowserPortableRestoreState(input.database, input.attachments)).target,
    inspectDatabase: async (database: PortableDatabase) => {
      const inspection = await input.database.inspectPortable(database, input.expectedVaultId);
      return Object.freeze({
        integrity: inspection.integrity,
        schemaVersion: inspection.schemaVersion,
        vaultId: inspection.vaultId,
      });
    },
    commit: async (payload: PortableArchiveRestoreCommitPayloadV1) => {
      if (payload.vaultId !== input.expectedVaultId) {
        throw new Error("The browser restore payload changed vault identity.");
      }
      const current = await inspectBrowserPortableRestoreState(input.database, input.attachments);
      if (current.target.fingerprint !== payload.expectedTargetFingerprint) {
        throw new Error("The browser restore target changed after preview.");
      }
      await input.attachments.putAll(payload.attachments);
      await input.database.restorePortable(payload.database, {
        expectedTargetSha256: current.portable.sha256,
        expectedVaultId: payload.vaultId,
      });
    },
  });
