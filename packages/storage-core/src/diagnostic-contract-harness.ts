import { DIAGNOSTIC_ATTRIBUTE_KEYS, type DiagnosticEventV1 } from "@coredrill/contracts";

import {
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  type DatabaseContractSuite,
} from "./contract-harness.js";
import type { DatabasePort } from "./database-port.js";
import { sqlStatement } from "./database-port.js";
import { DiagnosticEventRepository, LOCAL_DIAGNOSTIC_LOG_LIMITS } from "./diagnostic-repository.js";
import { PHASE_1_REPOSITORY_CONTRACT_MANIFEST } from "./repository-contract-manifest.js";

export interface DiagnosticRepositoryContractSetup {
  readonly migrate: (database: DatabasePort) => Promise<void>;
}

const OLDER_EVENT: DiagnosticEventV1 = {
  specVersion: 1,
  eventId: "0198e303-0000-7000-8000-000000000001",
  occurredAt: "2026-08-29T17:00:00.000Z",
  appVersion: "0.1.0",
  delivery: "local",
  category: "application",
  name: "operation_complete",
  severity: "info",
  outcome: "success",
  code: "ready",
  durationMs: 12,
  attributes: { adapter: "sqlite-wasm", result_count: 2 },
  redactedAttributeCount: 3,
};

const NEWER_EVENT: DiagnosticEventV1 = {
  ...OLDER_EVENT,
  eventId: "0198e303-0001-7000-8000-000000000002",
  occurredAt: "2026-08-29T17:01:00.000Z",
  severity: "warning",
  outcome: "degraded",
  code: "partial_result",
};

const assertContract = (condition: boolean, message: string): void => {
  if (!condition) throw new DatabaseContractViolation(message);
};

const expectFailure = async (
  operation: () => Promise<unknown>,
  predicate: (error: unknown) => boolean,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    if (predicate(error)) return;
    throw error;
  }
  throw new DatabaseContractViolation(message);
};

export const createDiagnosticRepositoryContractSuite = (
  setup: DiagnosticRepositoryContractSetup,
): DatabaseContractSuite =>
  defineDatabaseContractSuite(
    PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.diagnostic.suiteName,
    [
      {
        name: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.components.diagnostic.cases
          .persistPrivacySafeLog,
        run: async (database) => {
          await setup.migrate(database);
          const repository = new DiagnosticEventRepository(database);

          await repository.append(OLDER_EVENT);
          await repository.append(NEWER_EVENT);
          const recent = await repository.listRecent(2);
          assertContract(
            recent.length === 2 &&
              recent[0]?.eventId === NEWER_EVENT.eventId &&
              recent[1]?.eventId === OLDER_EVENT.eventId,
            "Diagnostic events did not round-trip in deterministic newest-first order.",
          );
          assertContract(
            Object.isFrozen(recent) &&
              Object.isFrozen(recent[0]) &&
              Object.isFrozen(recent[0]?.attributes),
            "Stored diagnostic events were not copied into immutable records.",
          );

          const privateValue = "PRIVATE_DIAGNOSTIC_SENTINEL";
          await expectFailure(
            () =>
              repository.append({
                ...NEWER_EVENT,
                eventId: "0198e303-0002-7000-8000-000000000003",
                attributes: { resume_text: privateValue },
              } as unknown as DiagnosticEventV1),
            (error) => error instanceof TypeError && !String(error).includes(privateValue),
            "The repository accepted or reflected a private diagnostic attribute.",
          );

          const rejectedAttributeMaps = [
            { resume_text: privateValue },
            { adapter: "C:\\Users\\Candidate\\private.sqlite" },
            { adapter: { nested: privateValue } },
            Object.fromEntries(DIAGNOSTIC_ATTRIBUTE_KEYS.slice(0, 33).map((key) => [key, 1])),
          ];
          for (const [index, attributes] of rejectedAttributeMaps.entries()) {
            await expectFailure(
              () =>
                database.execute(
                  sqlStatement(
                    `INSERT INTO diagnostic_event(
                       event_id, spec_version, occurred_at, app_version, delivery, category, name,
                       severity, outcome, attributes_json, redacted_attribute_count
                     ) VALUES (?, 1, ?, '0.1.0', 'local', 'application', 'operation_complete',
                               'error', 'failure', ?, 0)`,
                    [
                      `0198e303-000${String(index + 3)}-7000-8000-00000000000${String(index + 4)}`,
                      "2026-08-29T17:01:30.000Z",
                      JSON.stringify(attributes),
                    ],
                  ),
                ),
              () => true,
              "SQLite accepted content-bearing or oversized diagnostic JSON.",
            );
          }

          await expectFailure(
            () =>
              database.execute(
                sqlStatement("UPDATE diagnostic_event SET severity = 'error' WHERE event_id = ?", [
                  NEWER_EVENT.eventId,
                ]),
              ),
            () => true,
            "SQLite allowed a stored diagnostic event to be rewritten.",
          );

          await database.execute(
            sqlStatement(
              `WITH RECURSIVE sequence(value) AS (
                 SELECT 0
                 UNION ALL
                 SELECT value + 1 FROM sequence WHERE value < 1000
               )
               INSERT INTO diagnostic_event(
                 event_id, spec_version, occurred_at, app_version, delivery, category, name,
                 severity, outcome, attributes_json, redacted_attribute_count
               )
               SELECT printf('0198e304-%04x-7000-8000-%012x', value, value), 1,
                      '2026-08-29T17:02:00.000Z', '0.1.0', 'local', 'application',
                      'operation_complete', 'info', 'success', '{}', 0
               FROM sequence`,
            ),
          );
          assertContract(
            (await repository.count()) === LOCAL_DIAGNOSTIC_LOG_LIMITS.retainedEvents,
            "The local diagnostic retention boundary did not cap stored events.",
          );
          assertContract(
            (await repository.listRecent(1))[0]?.eventId === "0198e304-03e8-7000-8000-0000000003e8",
            "Diagnostic retention did not preserve the deterministic newest event.",
          );
        },
      },
    ],
  );
