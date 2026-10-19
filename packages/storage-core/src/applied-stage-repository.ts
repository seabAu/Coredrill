import { AppliedStageError, type AppliedStagePort } from "@coredrill/application";
import { createStatusStage, entityId, instant } from "@coredrill/domain";
import { sqlStatement, type DatabasePort } from "./database-port.js";
import { createPipelineRepositories } from "./pipeline-repositories.js";

/** Creates global user-owned configuration only; never updates an application's status. */
export const createAppliedStageRepository = (database: DatabasePort): AppliedStagePort => ({
  create: (input) =>
    database.transaction(async (session) => {
      const definition = createStatusStage({
        id: input.id,
        name: input.name,
        category: "applied",
        terminal: false,
        isSystem: false,
        sortOrder: 0,
      });
      const createdAt = instant(input.createdAt);
      const stages = createPipelineRepositories(session).statusDefinitions;
      const matches = await session.query(
        sqlStatement("SELECT id FROM status_definition WHERE name = ? COLLATE NOCASE", [
          definition.name,
        ]),
      );
      if (matches.length !== 0) {
        const id = matches[0]?.["id"];
        if (matches.length !== 1 || typeof id !== "string") throw new AppliedStageError("conflict");
        const existing = await stages.findById(entityId("status_definition", id));
        if (
          existing?.archivedAt !== null ||
          existing.category !== "applied" ||
          existing.terminal ||
          existing.name !== definition.name
        )
          throw new AppliedStageError("conflict");
        return Object.freeze({ id: existing.id, name: existing.name, created: false });
      }
      const order = await session.query(
        sqlStatement("SELECT coalesce(max(sort_order), -1) AS last_order FROM status_definition"),
      );
      const last = order[0]?.["last_order"];
      if (
        typeof last !== "number" ||
        !Number.isSafeInteger(last) ||
        last >= Number.MAX_SAFE_INTEGER
      )
        throw new AppliedStageError("unavailable");
      const stage = createStatusStage({ ...definition, sortOrder: last + 1 });
      await stages.create({
        ...stage,
        color: null,
        archivedAt: null,
        createdAt,
        updatedAt: createdAt,
      });
      return Object.freeze({ id: stage.id, name: stage.name, created: true });
    }),
});
