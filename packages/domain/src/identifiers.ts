import type { Brand } from "./brand.js";
import { DomainValidationError } from "./errors.js";

const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EntityId<TEntity extends string = string> = Brand<string, `entity-id:${TEntity}`>;

function assertEntityType(entityType: string): void {
  if (!ENTITY_TYPE_PATTERN.test(entityType) || entityType.length > 64) {
    throw new DomainValidationError(
      "invalid_entity_id",
      "Entity type must be a lowercase identifier of at most 64 characters.",
    );
  }
}

/** Parse and normalize an RFC 9562 UUIDv7 as an entity-specific ID. */
export function entityId<TEntity extends string>(
  entityType: TEntity,
  value: string,
): EntityId<TEntity> {
  assertEntityType(entityType);
  if (!UUID_V7_PATTERN.test(value)) {
    throw new DomainValidationError(
      "invalid_entity_id",
      `${entityType} ID must be an RFC 9562 UUIDv7.`,
    );
  }
  return value.toLowerCase() as EntityId<TEntity>;
}

export function isEntityId(value: unknown): value is EntityId {
  return typeof value === "string" && value === value.toLowerCase() && UUID_V7_PATTERN.test(value);
}

function toUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a local UUIDv7 without relying on a server sequence. */
export function generateEntityId<TEntity extends string>(entityType: TEntity): EntityId<TEntity> {
  assertEntityType(entityType);
  const cryptoApi = Reflect.get(globalThis, "crypto") as Crypto | undefined;
  if (cryptoApi === undefined) {
    throw new DomainValidationError(
      "invalid_entity_id",
      "A Web Crypto implementation is required to generate entity IDs.",
    );
  }

  const timestamp = Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
    throw new DomainValidationError(
      "invalid_entity_id",
      "System time cannot be encoded as UUIDv7.",
    );
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return entityId(entityType, toUuid(bytes));
}
