import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { entityId, instant, timeZone } from "@coredrill/domain";

import {
  JobActivityError,
  createJobActivityOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type InteractionDto,
  type InterviewDto,
  type JobActivityPort,
  type NextActionDto,
  type ReminderDto,
  type UndoableNextActionDto,
} from "../src/index.js";

const JOB_ID = entityId("job", "0198e203-0000-7000-8000-000000000001");
const APPLICATION_ID = entityId("application", "0198e203-0000-7000-8000-000000000002");
const CONTACT_ID = entityId("contact", "0198e203-0000-7000-8000-000000000003");
const INTERACTION_ID = entityId("interaction", "0198e203-0000-7000-8000-000000000004");
const NEXT_ACTION_ID = entityId("next-action", "0198e203-0000-7000-8000-000000000005");
const INTERVIEW_ID = entityId("interview", "0198e203-0000-7000-8000-000000000006");
const REMINDER_ID = entityId("reminder", "0198e203-0000-7000-8000-000000000007");
const UNDO_TOKEN_ID = entityId("mutation-undo-token", "0198e203-0000-7000-8000-000000000009");
const NOW = instant("2026-08-28T18:00:00.000Z");
const PAST = instant("2026-08-28T17:00:00.000Z");
const REMIND_AT = instant("2026-08-28T18:30:00.000Z");
const FUTURE = instant("2026-08-28T19:00:00.000Z");
const NEW_YORK = timeZone("America/New_York");
const context: ApplicationOperationContext = {
  operationId: entityId("application-operation", "0198e203-0000-7000-8000-000000000008"),
  initiatedAt: NOW,
};

const nextAction = (): NextActionDto => ({
  id: NEXT_ACTION_ID,
  jobId: JOB_ID,
  applicationId: APPLICATION_ID,
  interactionId: INTERACTION_ID,
  title: "Send a thoughtful follow-up",
  dueAt: FUTURE,
  timeZone: NEW_YORK,
  state: "pending",
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const undoToken = () => ({
  id: UNDO_TOKEN_ID,
  kind: "next_action_set" as const,
  jobId: JOB_ID,
  createdAt: NOW,
  consumedAt: null,
  rowVersion: 1,
});

const nextActionChange = (): UndoableNextActionDto => ({
  nextAction: nextAction(),
  undoToken: undoToken(),
});

const interaction = (): InteractionDto => ({
  id: INTERACTION_ID,
  jobId: JOB_ID,
  contactId: CONTACT_ID,
  type: "email_logged",
  occurredAt: PAST,
  direction: "outbound",
  summary: "Sent a thank-you note.",
  nextActionAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const interview = (): InterviewDto => ({
  id: INTERVIEW_ID,
  applicationId: APPLICATION_ID,
  stageName: "Hiring manager",
  startsAt: FUTURE,
  timeZone: NEW_YORK,
  durationMinutes: 45,
  locationOrUrl: "Video call",
  contactIds: Object.freeze([CONTACT_ID]),
  preparationNotes: "Review the role evidence.",
  outcome: null,
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const reminder = (): ReminderDto => ({
  id: REMINDER_ID,
  jobId: JOB_ID,
  nextActionId: NEXT_ACTION_ID,
  interviewId: null,
  remindAt: REMIND_AT,
  timeZone: NEW_YORK,
  state: "pending",
  note: "Follow up before the interview.",
  firedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  rowVersion: 1,
});

const activityPort = (): JobActivityPort => ({
  setNextAction: vi.fn(async () => nextActionChange()),
  recordInteraction: vi.fn(async () => interaction()),
  scheduleInterview: vi.fn(async () => interview()),
  scheduleReminder: vi.fn(async () => reminder()),
});

const operationsFor = (activity: JobActivityPort) =>
  createJobActivityOperations({
    activity,
    createInteractionId: () => INTERACTION_ID,
    createNextActionId: () => NEXT_ACTION_ID,
    createUndoTokenId: () => UNDO_TOKEN_ID,
    createInterviewId: () => INTERVIEW_ID,
    createReminderId: () => REMINDER_ID,
  });

describe("job activity application operations", () => {
  it("sets one pending next action with an explicit future-time interpretation", async () => {
    const activity = activityPort();
    const { setNextActionCommand } = operationsFor(activity);

    expect(setNextActionCommand).toMatchObject({
      kind: "command",
      name: "SetNextActionCommand",
      transactional: true,
    });
    const result = await setNextActionCommand.execute(
      {
        jobId: JOB_ID,
        applicationId: APPLICATION_ID,
        interactionId: INTERACTION_ID,
        title: "Send a thoughtful follow-up",
        dueAt: FUTURE,
        timeZone: NEW_YORK,
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: nextActionChange() });
    expect(activity.setNextAction).toHaveBeenCalledWith({
      id: NEXT_ACTION_ID,
      undoTokenId: UNDO_TOKEN_ID,
      jobId: JOB_ID,
      applicationId: APPLICATION_ID,
      interactionId: INTERACTION_ID,
      title: "Send a thoughtful follow-up",
      dueAt: FUTURE,
      timeZone: NEW_YORK,
      state: "pending",
      completedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    expectTypeOf(setNextActionCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<UndoableNextActionDto>>
    >();
  });

  it("supports an unscheduled next action without inventing a time zone", async () => {
    const activity = activityPort();
    vi.mocked(activity.setNextAction).mockResolvedValueOnce({
      nextAction: {
        ...nextAction(),
        applicationId: null,
        interactionId: null,
        title: "Research the team",
        dueAt: null,
        timeZone: null,
      },
      undoToken: undoToken(),
    });
    const { setNextActionCommand } = operationsFor(activity);

    await expect(
      setNextActionCommand.execute({ jobId: JOB_ID, title: "Research the team" }, context),
    ).resolves.toEqual({
      ok: true,
      value: {
        nextAction: {
          ...nextAction(),
          applicationId: null,
          interactionId: null,
          title: "Research the team",
          dueAt: null,
          timeZone: null,
        },
        undoToken: undoToken(),
      },
    });
  });

  it.each([
    [{ jobId: "bad", title: "Follow up" }, "job ID"],
    [{ jobId: JOB_ID, applicationId: "bad", title: "Follow up" }, "application ID"],
    [{ jobId: JOB_ID, interactionId: "bad", title: "Follow up" }, "interaction ID"],
    [{ jobId: JOB_ID, title: "" }, "empty title"],
    [{ jobId: JOB_ID, title: "x".repeat(513) }, "overlong title"],
    [{ jobId: JOB_ID, title: "Follow up", dueAt: FUTURE }, "missing time zone"],
    [{ jobId: JOB_ID, title: "Follow up", timeZone: NEW_YORK }, "missing due instant"],
    [{ jobId: JOB_ID, title: "Follow up", dueAt: FUTURE, timeZone: "Mars/Olympus" }, "time zone"],
  ] as const)("rejects an invalid next-action %s before persistence", async (input, _label) => {
    const activity = activityPort();
    const createNextActionId = vi.fn(() => NEXT_ACTION_ID);
    const operations = createJobActivityOperations({
      activity,
      createInteractionId: () => INTERACTION_ID,
      createNextActionId,
      createUndoTokenId: () => UNDO_TOKEN_ID,
      createInterviewId: () => INTERVIEW_ID,
      createReminderId: () => REMINDER_ID,
    });

    const result = await operations.setNextActionCommand.execute(input as never, context);
    expect(result).toMatchObject({ ok: false, error: { code: "validation", retryable: false } });
    expect(createNextActionId).not.toHaveBeenCalled();
    expect(activity.setNextAction).not.toHaveBeenCalled();
  });

  it("records a past interaction while binding audit time to the operation clock", async () => {
    const activity = activityPort();
    const { recordInteractionCommand } = operationsFor(activity);

    expect(recordInteractionCommand).toMatchObject({
      kind: "command",
      name: "RecordInteractionCommand",
      transactional: true,
    });
    const result = await recordInteractionCommand.execute(
      {
        jobId: JOB_ID,
        contactId: CONTACT_ID,
        type: "email_logged",
        occurredAt: PAST,
        direction: "outbound",
        summary: "Sent a thank-you note.",
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: interaction() });
    expect(activity.recordInteraction).toHaveBeenCalledWith({
      id: INTERACTION_ID,
      jobId: JOB_ID,
      contactId: CONTACT_ID,
      type: "email_logged",
      occurredAt: PAST,
      direction: "outbound",
      summary: "Sent a thank-you note.",
      nextActionAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expectTypeOf(recordInteractionCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<InteractionDto>>
    >();
  });

  it("uses explicit local defaults when recording an interaction now", async () => {
    const activity = activityPort();
    vi.mocked(activity.recordInteraction).mockResolvedValueOnce({
      ...interaction(),
      contactId: null,
      type: "note",
      occurredAt: NOW,
      direction: "unknown",
      summary: "",
    });
    const { recordInteractionCommand } = operationsFor(activity);

    await recordInteractionCommand.execute({ jobId: JOB_ID, type: "note" }, context);
    expect(activity.recordInteraction).toHaveBeenCalledWith({
      id: INTERACTION_ID,
      jobId: JOB_ID,
      contactId: null,
      type: "note",
      occurredAt: NOW,
      direction: "unknown",
      summary: "",
      nextActionAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it.each([
    [{ jobId: "bad", type: "note" }, "job ID"],
    [{ jobId: JOB_ID, contactId: "bad", type: "note" }, "contact ID"],
    [{ jobId: JOB_ID, type: "Email sent" }, "unsafe type"],
    [{ jobId: JOB_ID, type: "note", occurredAt: FUTURE }, "future occurrence"],
    [{ jobId: JOB_ID, type: "note", direction: "sideways" }, "direction"],
    [{ jobId: JOB_ID, type: "note", summary: "unsafe\u0000text" }, "summary"],
  ] as const)("rejects an invalid interaction %s", async (input, _label) => {
    const activity = activityPort();
    const result = await operationsFor(activity).recordInteractionCommand.execute(
      input as never,
      context,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(activity.recordInteraction).not.toHaveBeenCalled();
  });

  it("schedules an interview in a canonical IANA time zone", async () => {
    const activity = activityPort();
    const { scheduleInterviewCommand } = operationsFor(activity);

    expect(scheduleInterviewCommand).toMatchObject({
      kind: "command",
      name: "ScheduleInterviewCommand",
      transactional: true,
    });
    const result = await scheduleInterviewCommand.execute(
      {
        applicationId: APPLICATION_ID,
        stageName: "Hiring manager",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 45,
        locationOrUrl: "Video call",
        contactIds: [CONTACT_ID],
        preparationNotes: "Review the role evidence.",
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: interview() });
    expect(activity.scheduleInterview).toHaveBeenCalledWith({
      id: INTERVIEW_ID,
      applicationId: APPLICATION_ID,
      stageName: "Hiring manager",
      startsAt: FUTURE,
      timeZone: NEW_YORK,
      durationMinutes: 45,
      locationOrUrl: "Video call",
      contactIds: [CONTACT_ID],
      preparationNotes: "Review the role evidence.",
      outcome: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.contactIds)).toBe(true);
    }
    expectTypeOf(scheduleInterviewCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<InterviewDto>>
    >();
  });

  it.each([
    [
      {
        applicationId: "bad",
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 60,
      },
      "application ID",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 60,
      },
      "stage",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: NOW,
        timeZone: NEW_YORK,
        durationMinutes: 60,
      },
      "non-future start",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: "Not/AZone",
        durationMinutes: 60,
      },
      "time zone",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 0,
      },
      "duration",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 1441,
      },
      "duration limit",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 60,
        contactIds: ["bad"],
      },
      "contact ID",
    ],
    [
      {
        applicationId: APPLICATION_ID,
        stageName: "Panel",
        startsAt: FUTURE,
        timeZone: NEW_YORK,
        durationMinutes: 60,
        contactIds: [CONTACT_ID, CONTACT_ID],
      },
      "duplicate contact",
    ],
  ] as const)(
    "rejects an invalid interview %s against the operation clock",
    async (input, _label) => {
      const activity = activityPort();
      const result = await operationsFor(activity).scheduleInterviewCommand.execute(
        input as never,
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(activity.scheduleInterview).not.toHaveBeenCalled();
    },
  );

  it("schedules a pending local reminder without invoking a network scheduler", async () => {
    const activity = activityPort();
    const { scheduleReminderCommand } = operationsFor(activity);

    expect(scheduleReminderCommand).toMatchObject({
      kind: "command",
      name: "ScheduleReminderCommand",
      transactional: true,
    });
    const result = await scheduleReminderCommand.execute(
      {
        jobId: JOB_ID,
        nextActionId: NEXT_ACTION_ID,
        remindAt: REMIND_AT,
        timeZone: NEW_YORK,
        note: "Follow up before the interview.",
      },
      context,
    );

    expect(result).toEqual({ ok: true, value: reminder() });
    expect(activity.scheduleReminder).toHaveBeenCalledWith({
      id: REMINDER_ID,
      jobId: JOB_ID,
      nextActionId: NEXT_ACTION_ID,
      interviewId: null,
      remindAt: REMIND_AT,
      timeZone: NEW_YORK,
      state: "pending",
      note: "Follow up before the interview.",
      firedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expectTypeOf(scheduleReminderCommand.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<ReminderDto>>
    >();
  });

  it.each([
    [{ jobId: "bad", remindAt: REMIND_AT, timeZone: NEW_YORK }, "job ID"],
    [
      { jobId: JOB_ID, nextActionId: "bad", remindAt: REMIND_AT, timeZone: NEW_YORK },
      "next-action ID",
    ],
    [
      { jobId: JOB_ID, interviewId: "bad", remindAt: REMIND_AT, timeZone: NEW_YORK },
      "interview ID",
    ],
    [{ jobId: JOB_ID, remindAt: NOW, timeZone: NEW_YORK }, "non-future reminder"],
    [{ jobId: JOB_ID, remindAt: REMIND_AT, timeZone: "Invalid/Zone" }, "time zone"],
    [{ jobId: JOB_ID, remindAt: REMIND_AT, timeZone: NEW_YORK, note: "   " }, "empty note"],
  ] as const)(
    "rejects an invalid reminder %s against the operation clock",
    async (input, _label) => {
      const activity = activityPort();
      const result = await operationsFor(activity).scheduleReminderCommand.execute(
        input as never,
        context,
      );
      expect(result).toMatchObject({ ok: false, error: { code: "validation" } });
      expect(activity.scheduleReminder).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["already_exists", "conflict", "This local activity already exists.", false],
    ["not_found", "not_found", "The requested local activity record was not found.", false],
    [
      "linkage_conflict",
      "conflict",
      "The selected activity records do not belong together.",
      false,
    ],
    ["scheduling_conflict", "conflict", "The local schedule changed. Review it, then retry.", true],
    ["busy", "conflict", "The local activity store is busy. Retry shortly.", true],
    ["unavailable", "unavailable", "Local activity storage is unavailable.", true],
    [
      "permission_denied",
      "permission_denied",
      "Coredrill cannot access local activity storage.",
      true,
    ],
    ["read_only", "permission_denied", "The local activity store is read-only.", false],
    ["invalid_state", "internal", "The local activity store is not in a usable state.", false],
  ] as const)(
    "maps the %s activity failure to a stable content-free error",
    async (portCode, applicationCode, message, retryable) => {
      const activity = activityPort();
      vi.mocked(activity.scheduleReminder).mockRejectedValueOnce(new JobActivityError(portCode));

      await expect(
        operationsFor(activity).scheduleReminderCommand.execute(
          { jobId: JOB_ID, remindAt: REMIND_AT, timeZone: NEW_YORK },
          context,
        ),
      ).resolves.toEqual({
        ok: false,
        error: { code: applicationCode, message, retryable },
      });
    },
  );

  it("redacts unknown persistence failures", async () => {
    const activity = activityPort();
    vi.mocked(activity.recordInteraction).mockRejectedValueOnce(
      new Error("C:\\Users\\Candidate\\private.sqlite contains contact notes and SQL"),
    );

    const result = await operationsFor(activity).recordInteractionCommand.execute(
      { jobId: JOB_ID, type: "note" },
      context,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local activity operation failed safely.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Candidate");
    expect(JSON.stringify(result)).not.toContain("contact notes");
    expect(JSON.stringify(result)).not.toContain("SQL");
  });

  it.each(["setNextAction", "recordInteraction", "scheduleInterview", "scheduleReminder"] as const)(
    "fails closed when %s returns a record that does not match the command",
    async (operation) => {
      const activity = activityPort();
      if (operation === "setNextAction") {
        vi.mocked(activity.setNextAction).mockResolvedValueOnce({
          nextAction: {
            ...nextAction(),
            jobId: entityId("job", "0198e203-0000-7000-8000-000000000099"),
          },
          undoToken: undoToken(),
        });
        await expect(
          operationsFor(activity).setNextActionCommand.execute(
            {
              jobId: JOB_ID,
              applicationId: APPLICATION_ID,
              interactionId: INTERACTION_ID,
              title: nextAction().title,
              dueAt: FUTURE,
              timeZone: NEW_YORK,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      } else if (operation === "recordInteraction") {
        vi.mocked(activity.recordInteraction).mockResolvedValueOnce({
          ...interaction(),
          occurredAt: FUTURE,
        });
        await expect(
          operationsFor(activity).recordInteractionCommand.execute(
            {
              jobId: JOB_ID,
              contactId: CONTACT_ID,
              type: interaction().type,
              occurredAt: PAST,
              direction: "outbound",
              summary: interaction().summary,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      } else if (operation === "scheduleInterview") {
        vi.mocked(activity.scheduleInterview).mockResolvedValueOnce({
          ...interview(),
          timeZone: timeZone("UTC"),
        });
        await expect(
          operationsFor(activity).scheduleInterviewCommand.execute(
            {
              applicationId: APPLICATION_ID,
              stageName: interview().stageName,
              startsAt: FUTURE,
              timeZone: NEW_YORK,
              durationMinutes: 45,
              locationOrUrl: interview().locationOrUrl,
              contactIds: [CONTACT_ID],
              preparationNotes: interview().preparationNotes,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      } else {
        vi.mocked(activity.scheduleReminder).mockResolvedValueOnce({
          ...reminder(),
          state: "fired",
          firedAt: NOW,
        });
        await expect(
          operationsFor(activity).scheduleReminderCommand.execute(
            {
              jobId: JOB_ID,
              nextActionId: NEXT_ACTION_ID,
              remindAt: REMIND_AT,
              timeZone: NEW_YORK,
              note: reminder().note,
            },
            context,
          ),
        ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
      }
    },
  );
});
