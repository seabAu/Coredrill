import {
  applicationFailure,
  ContactFieldUseStorageError,
  createContactFieldUseOperations,
  parseContactUseRecordInputV1,
  parseContactUseRecordRequestV1,
  parseContactUseControlInputV1,
  parseContactUseControlRequestV1,
  type ApplicationOperationContext,
  type ContactUseRecordRequestV1,
  type ContactUseControlRequestV1,
  type ContactFieldUsePortV1,
  type ReadContactFieldUseInputV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { createContactFieldUseRepository, type DatabasePort } from "@coredrill/storage-core";

const unavailable = () =>
  applicationFailure({
    code: "unavailable",
    message:
      "The local contact review could not be confirmed. Keep its original context and inspect stored state before retrying.",
    retryable: true,
  });
const invalid = () =>
  applicationFailure({
    code: "validation",
    message: "Review the original contact evidence action and context.",
    retryable: false,
  });
const copyContext = (input: unknown): ApplicationOperationContext => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2 ||
    Object.getOwnPropertySymbols(input).length !== 0 ||
    Object.keys(input).some((key) => key !== "operationId" && key !== "initiatedAt")
  )
    throw new TypeError("Invalid local operation context.");
  const value = input as Record<string, unknown>;
  const operationId = value["operationId"],
    initiatedAt = value["initiatedAt"];
  if (typeof operationId !== "string" || typeof initiatedAt !== "string")
    throw new TypeError("Invalid local operation context.");
  return Object.freeze({
    operationId: entityId("application-operation", operationId),
    initiatedAt: instant(initiatedAt),
  });
};

/** Selected-runtime composition only. Construction and action binding perform no storage work. */
export const createStoredContactFieldUseApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createRecordId: () => string,
  hashValue: (value: string) => Promise<string>,
) => {
  if (
    [database, context, createRecordId, hashValue].some(
      (capability) => typeof capability !== "function",
    )
  )
    throw new TypeError("Contact reviews need local runtime capabilities.");
  const selected = async () => {
    let db: DatabasePort;
    try {
      db = await database();
    } catch {
      throw new ContactFieldUseStorageError("unavailable");
    }
    return createContactFieldUseRepository(db, hashValue);
  };
  const operations = (capture?: {
    record: (request: ContactUseRecordRequestV1) => void;
    control: (request: ContactUseControlRequestV1) => void;
    dispatched: () => void;
  }) => {
    const port: ContactFieldUsePortV1 = {
      record: async (input) => {
        const request = parseContactUseRecordRequestV1(input);
        capture?.record(request);
        const port = await selected();
        capture?.dispatched();
        return port.record(request);
      },
      control: async (input) => {
        const request = parseContactUseControlRequestV1(input);
        capture?.control(request);
        const port = await selected();
        capture?.dispatched();
        return port.control(request);
      },
      readField: async (input) => (await selected()).readField(input),
      inspect: async (input) => (await selected()).inspect(input),
    };
    return createContactFieldUseOperations(port, hashValue);
  };
  const query = operations();
  const bind = (input: unknown, kind: "record" | "control") => {
    const payload =
      kind === "record"
        ? parseContactUseRecordInputV1(input)
        : parseContactUseControlInputV1(input);
    let firstContext: ApplicationOperationContext | null = null;
    let original: ContactUseRecordRequestV1 | ContactUseControlRequestV1 | null = null;
    let dispatched = false;
    const capture = (request: ContactUseRecordRequestV1 | ContactUseControlRequestV1) => {
      if (original !== null && JSON.stringify(request) !== JSON.stringify(original))
        throw new ContactFieldUseStorageError("invalid_state");
      original ??= request;
    };
    const local = operations({
      record: capture,
      control: capture,
      dispatched: () => {
        dispatched = true;
      },
    });
    return Object.freeze({
      input: payload,
      attemptContext: () => firstContext,
      originalRequest: () => original,
      wasDispatched: () => dispatched,
      submit: async () => {
        try {
          firstContext ??= copyContext(context());
        } catch {
          return invalid();
        }
        try {
          return kind === "record"
            ? await local.record.execute(payload, firstContext)
            : await local.control.execute(payload, firstContext);
        } catch {
          return unavailable();
        }
      },
      inspect: async () => {
        if (original === null) return invalid();
        try {
          return await local.inspect.execute(original, copyContext(context()));
        } catch {
          return unavailable();
        }
      },
    });
  };
  return Object.freeze({
    newRecordId: () => entityId("contact-use-record", createRecordId()),
    beginRecord: (input: unknown) => bind(input, "record"),
    beginControl: (input: unknown) => bind(input, "control"),
    readField: async (input: ReadContactFieldUseInputV1) => {
      try {
        return await query.readField.execute(input, copyContext(context()));
      } catch {
        return unavailable();
      }
    },
  });
};
export type StoredContactFieldUseApi = ReturnType<typeof createStoredContactFieldUseApi>;
export type StoredContactFieldUseAction = ReturnType<StoredContactFieldUseApi["beginRecord"]>;
