import { ApplicationAttemptError, type ApplicationAttemptPort } from "@coredrill/application";
import { compareInstant, createStatusStage, entityId, type EntityId } from "@coredrill/domain";

import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";
import { createPipelineRepositories } from "./pipeline-repositories.js";
import { createTrackerRepositories } from "./tracker-repositories.js";

export const createApplicationAttemptRepository = (
  database: DatabasePort,
): ApplicationAttemptPort => ({
  start: (input) =>
    database.transaction(async (transaction) => {
      const tracker = createTrackerRepositories(transaction);
      const pipeline = createPipelineRepositories(transaction);
      const job = await tracker.jobs.findById(input.jobId);
      if (job?.archivedAt !== null) throw new ApplicationAttemptError("not_found");
      if (
        job.rowVersion !== input.expectedJobRowVersion ||
        compareInstant(job.updatedAt, input.createdAt) > 0
      )
        throw new ApplicationAttemptError("conflict");
      if (job.currentStatusId !== null) {
        const current = await pipeline.statusDefinitions.findById(job.currentStatusId);
        if (current?.archivedAt !== null || current.terminal)
          throw new ApplicationAttemptError("conflict");
      }
      const priorAttempts = await transaction.query(
        sqlStatement(
          "SELECT id FROM application WHERE job_id = ? AND archived_at IS NULL LIMIT 1",
          [input.jobId],
        ),
      );
      if (priorAttempts.length !== 0) throw new ApplicationAttemptError("conflict");

      const stages = await transaction.query<{ readonly id: string } & QueryRow>(
        sqlStatement(
          "SELECT id FROM status_definition WHERE name = ? COLLATE NOCASE AND archived_at IS NULL",
          [input.preparationStageName],
        ),
      );
      let statusId: EntityId<"status_definition">;
      let statusName: string;
      if (stages.length > 0) {
        const first = stages[0];
        if (stages.length !== 1 || first === undefined)
          throw new ApplicationAttemptError("conflict");
        const stage = await pipeline.statusDefinitions.findById(
          entityId("status_definition", first.id),
        );
        if (
          stage?.category !== "preparing" ||
          stage.terminal ||
          stage.name !== input.preparationStageName
        )
          throw new ApplicationAttemptError("conflict");
        statusId = stage.id;
        statusName = stage.name;
      } else {
        const order = await transaction.query<{ readonly last_order: number } & QueryRow>(
          sqlStatement("SELECT coalesce(max(sort_order), -1) AS last_order FROM status_definition"),
        );
        const stage = createStatusStage({
          id: input.newStageId,
          name: input.preparationStageName,
          category: "preparing",
          terminal: false,
          isSystem: false,
          sortOrder: (order[0]?.last_order ?? -1) + 1,
        });
        await pipeline.statusDefinitions.create({
          ...stage,
          color: null,
          archivedAt: null,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        });
        statusId = stage.id;
        statusName = stage.name;
      }
      await pipeline.applications.create({
        id: input.applicationId,
        jobId: input.jobId,
        appliedAt: null,
        channel: null,
        currentStatusId: statusId,
        selectedResumeVersionId: null,
        selectedCoverLetterVersionId: null,
        notes: "",
        archivedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      });
      const updated = await transaction.execute(
        sqlStatement(
          "UPDATE job SET current_status_id = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ? AND row_version = ? AND archived_at IS NULL",
          [statusId, input.createdAt, input.jobId, input.expectedJobRowVersion],
        ),
      );
      if (updated.rowsAffected !== 1) throw new ApplicationAttemptError("conflict");
      const event = await transaction.execute(
        sqlStatement(
          `INSERT INTO status_event(id, job_id, application_id, from_status_id, to_status_id, occurred_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.eventId,
            input.jobId,
            input.applicationId,
            job.currentStatusId,
            statusId,
            input.createdAt,
            "Started local preparation; nothing submitted.",
            input.createdAt,
          ],
        ),
      );
      if (event.rowsAffected !== 1) throw new ApplicationAttemptError("conflict");
      return Object.freeze({
        applicationId: input.applicationId,
        jobId: input.jobId,
        statusId,
        statusName,
        jobRowVersion: input.expectedJobRowVersion + 1,
        createdAt: input.createdAt,
      });
    }),
});
