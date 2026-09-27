import { DomainValidationError } from "./errors.js";

export const JOB_REQUIREMENT_CATEGORIES = Object.freeze([
  "required",
  "desired",
  "responsibility",
  "context",
  "constraint",
] as const);

export type JobRequirementCategory = (typeof JOB_REQUIREMENT_CATEGORIES)[number];

export function jobRequirementCategory(value: string): JobRequirementCategory {
  if (!JOB_REQUIREMENT_CATEGORIES.includes(value as JobRequirementCategory)) {
    throw new DomainValidationError(
      "invalid_job_requirement_category",
      "Job requirement category must use the reviewed requirement vocabulary.",
    );
  }
  return value as JobRequirementCategory;
}
