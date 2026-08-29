import {
  diagnosticEventV1Schema,
  type DiagnosticAttributeValue,
  type DiagnosticEventV1,
} from "@coredrill/contracts";

import { sqlStatement, type DatabaseSession, type QueryRow } from "./database-port.js";

export const LOCAL_DIAGNOSTIC_LOG_LIMITS = Object.freeze({
  maxReturnedEvents: 200,
  retainedEvents: 1000,
});

interface DiagnosticEventRow extends QueryRow {
  readonly event_id: string;
  readonly spec_version: number;
  readonly occurred_at: string;
  readonly app_version: string;
  readonly delivery: string;
  readonly category: string;
  readonly name: string;
  readonly severity: string;
  readonly outcome: string;
  readonly operation_id: string | null;
  readonly code: string | null;
  readonly duration_ms: number | null;
  readonly attributes_json: string;
  readonly redacted_attribute_count: number;
}

interface CountRow extends QueryRow {
  readonly total: number;
}

const parseEvent = (value: unknown): DiagnosticEventV1 => {
  const parsed = diagnosticEventV1Schema.safeParse(value);
  if (!parsed.success) throw new TypeError("Diagnostic event is invalid.");
  return Object.freeze({
    ...parsed.data,
    attributes: Object.freeze({ ...parsed.data.attributes }),
  });
};

const serializeAttributes = (
  attributes: Readonly<Record<string, DiagnosticAttributeValue>>,
): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );

const parseAttributes = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new TypeError("Stored diagnostic attributes are invalid.");
  }
};

const mapEvent = (row: DiagnosticEventRow): DiagnosticEventV1 =>
  parseEvent({
    specVersion: row.spec_version,
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    appVersion: row.app_version,
    delivery: row.delivery,
    category: row.category,
    name: row.name,
    severity: row.severity,
    outcome: row.outcome,
    ...(row.operation_id === null ? {} : { operationId: row.operation_id }),
    ...(row.code === null ? {} : { code: row.code }),
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
    attributes: parseAttributes(row.attributes_json),
    redactedAttributeCount: row.redacted_attribute_count,
  });

const eventLimit = (value: number): number => {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > LOCAL_DIAGNOSTIC_LOG_LIMITS.maxReturnedEvents
  ) {
    throw new TypeError(
      `Diagnostic queries require a limit from 1 to ${String(LOCAL_DIAGNOSTIC_LOG_LIMITS.maxReturnedEvents)}.`,
    );
  }
  return value;
};

export class DiagnosticEventRepository {
  public constructor(private readonly session: DatabaseSession) {}

  public async append(input: DiagnosticEventV1): Promise<void> {
    const event = parseEvent(input);
    const result = await this.session.execute(
      sqlStatement(
        `INSERT INTO diagnostic_event(
           event_id, spec_version, occurred_at, app_version, delivery, category, name,
           severity, outcome, operation_id, code, duration_ms, attributes_json,
           redacted_attribute_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.eventId,
          event.specVersion,
          event.occurredAt,
          event.appVersion,
          event.delivery,
          event.category,
          event.name,
          event.severity,
          event.outcome,
          event.operationId ?? null,
          event.code ?? null,
          event.durationMs ?? null,
          serializeAttributes(event.attributes),
          event.redactedAttributeCount,
        ],
      ),
    );
    if (result.rowsAffected !== 1) {
      throw new Error("Diagnostic event append did not commit.");
    }
  }

  public async listRecent(limit: number): Promise<readonly DiagnosticEventV1[]> {
    const rows = await this.session.query<DiagnosticEventRow>(
      sqlStatement(
        `SELECT event_id, spec_version, occurred_at, app_version, delivery, category, name,
                severity, outcome, operation_id, code, duration_ms, attributes_json,
                redacted_attribute_count
         FROM diagnostic_event
         ORDER BY occurred_at DESC, event_id DESC
         LIMIT ?`,
        [eventLimit(limit)],
      ),
    );
    return Object.freeze(rows.map(mapEvent));
  }

  public async count(): Promise<number> {
    const rows = await this.session.query<CountRow>(
      sqlStatement("SELECT count(*) AS total FROM diagnostic_event"),
    );
    const total = rows[0]?.total;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
      throw new Error("Stored diagnostic event count is invalid.");
    }
    return total;
  }
}
