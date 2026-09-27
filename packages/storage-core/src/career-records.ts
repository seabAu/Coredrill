import type { JsonValue } from "@coredrill/contracts";
import type { DateOnly, EntityId, Instant, WebUrl } from "@coredrill/domain";

export type CareerVerificationState =
  "disputed" | "imported" | "source_backed" | "stale" | "user_confirmed";

export interface CareerAuditFields {
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface EmploymentRecord extends CareerAuditFields {
  readonly id: EntityId<"experience">;
  readonly organization: string;
  readonly role: string;
  readonly startDate: DateOnly | null;
  readonly endDate: DateOnly | null;
  readonly current: boolean;
  readonly description: string;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface EducationRecord extends CareerAuditFields {
  readonly id: EntityId<"education">;
  readonly institution: string;
  readonly credential: string;
  readonly field: string | null;
  readonly startDate: DateOnly | null;
  readonly endDate: DateOnly | null;
  readonly details: string;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface ProjectRecord extends CareerAuditFields {
  readonly id: EntityId<"project">;
  readonly name: string;
  readonly summary: string;
  readonly url: WebUrl | null;
  readonly startDate: DateOnly | null;
  readonly endDate: DateOnly | null;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface SkillRecord extends CareerAuditFields {
  readonly id: EntityId<"skill">;
  readonly canonicalName: string;
  readonly category: string | null;
  readonly aliases: readonly string[];
}

export type AccomplishmentParentType =
  "education" | "experience" | "project" | "standalone" | "volunteer_experience";

export interface AccomplishmentRecord extends CareerAuditFields {
  readonly id: EntityId<"accomplishment">;
  readonly parentType: AccomplishmentParentType;
  readonly parentId: EntityId | null;
  readonly action: string;
  readonly result: string;
  readonly metrics: Readonly<Record<string, JsonValue>>;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface CertificationRecord extends CareerAuditFields {
  readonly id: EntityId<"certification">;
  readonly name: string;
  readonly issuer: string;
  readonly issuedDate: DateOnly | null;
  readonly expiresDate: DateOnly | null;
  readonly credentialUrl: WebUrl | null;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface PublicationRecord extends CareerAuditFields {
  readonly id: EntityId<"publication">;
  readonly title: string;
  readonly publisher: string | null;
  readonly publishedDate: DateOnly | null;
  readonly url: WebUrl | null;
  readonly summary: string;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface VolunteerRecord extends CareerAuditFields {
  readonly id: EntityId<"volunteer-experience">;
  readonly organization: string;
  readonly role: string;
  readonly startDate: DateOnly | null;
  readonly endDate: DateOnly | null;
  readonly current: boolean;
  readonly description: string;
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface CareerStoryRecord extends CareerAuditFields {
  readonly id: EntityId<"anecdote">;
  readonly title: string;
  readonly situation: string;
  readonly action: string;
  readonly result: string;
  readonly tags: readonly string[];
  readonly sourceDocumentId: EntityId<"document"> | null;
  readonly verificationState: CareerVerificationState;
}

export interface CareerPreferenceRecord {
  readonly id: EntityId<"candidate-profile">;
  readonly displayName: string;
  readonly summary: string;
  readonly targetRoles: readonly string[];
  readonly locationId: EntityId<"location"> | null;
  readonly workPreferences: Readonly<Record<string, JsonValue>>;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
