import type {
  EntityId,
  Instant,
  StatusCategory,
  StatusDefinitionId,
  TimeZone,
} from "@coredrill/domain";

export interface StatusDefinitionRecord {
  readonly id: StatusDefinitionId;
  readonly name: string;
  readonly category: StatusCategory;
  readonly color: string | null;
  readonly isSystem: boolean;
  readonly sortOrder: number;
  readonly terminal: boolean;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface ApplicationRecord {
  readonly id: EntityId<"application">;
  readonly jobId: EntityId<"job">;
  readonly appliedAt: Instant | null;
  readonly channel: string | null;
  readonly currentStatusId: StatusDefinitionId;
  readonly selectedResumeVersionId: EntityId<"document-version"> | null;
  readonly selectedCoverLetterVersionId: EntityId<"document-version"> | null;
  readonly notes: string;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface StatusEventRecord {
  readonly id: EntityId<"status-event">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly fromStatusId: StatusDefinitionId | null;
  readonly toStatusId: StatusDefinitionId;
  readonly occurredAt: Instant;
  readonly note: string | null;
  readonly createdAt: Instant;
  readonly rowVersion: number;
}

export type InteractionDirection = "inbound" | "mutual" | "outbound" | "unknown";

export interface InteractionRecord {
  readonly id: EntityId<"interaction">;
  readonly jobId: EntityId<"job">;
  readonly contactId: EntityId<"contact"> | null;
  readonly type: string;
  readonly occurredAt: Instant;
  readonly direction: InteractionDirection;
  readonly summary: string;
  readonly nextActionAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export type NextActionState = "completed" | "dismissed" | "pending";

export interface NextActionRecord {
  readonly id: EntityId<"next-action">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly interactionId: EntityId<"interaction"> | null;
  readonly title: string;
  readonly dueAt: Instant | null;
  readonly timeZone: TimeZone | null;
  readonly state: NextActionState;
  readonly completedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface InterviewRecord {
  readonly id: EntityId<"interview">;
  readonly applicationId: EntityId<"application">;
  readonly stageName: string;
  readonly startsAt: Instant;
  readonly timeZone: TimeZone;
  readonly durationMinutes: number;
  readonly locationOrUrl: string | null;
  readonly contactIds: readonly EntityId<"contact">[];
  readonly preparationNotes: string;
  readonly outcome: string | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export type ReminderState = "dismissed" | "fired" | "pending";

export interface ReminderRecord {
  readonly id: EntityId<"reminder">;
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action"> | null;
  readonly interviewId: EntityId<"interview"> | null;
  readonly remindAt: Instant;
  readonly timeZone: TimeZone;
  readonly state: ReminderState;
  readonly note: string | null;
  readonly firedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
