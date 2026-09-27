/** Evidence matching and claim-support policies. */
export {
  CAREER_EVIDENCE_STATE_LIMITS,
  CAREER_EVIDENCE_VERIFICATION_STATES,
  careerPrivacyTag,
  createCareerEvidenceState,
  isCareerEvidenceEligibleForExternalContext,
  markCareerEvidenceStale,
  transitionCareerEvidenceVerification,
  type CareerEvidenceState,
  type CareerEvidenceStateInput,
  type CareerEvidenceVerificationState,
  type CareerPrivacyTag,
} from "./evidence-state.js";
