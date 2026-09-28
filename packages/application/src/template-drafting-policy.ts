import {
  classifyApplicationQuestion,
  type ApplicationQuestionHandling,
  type ApplicationQuestionKind,
  type ApplicationQuestionPolicyDto,
} from "./application-question-policy.js";

export type DraftableTemplateQuestionKind = Extract<
  ApplicationQuestionKind,
  "behavioral-star" | "experience-evidence" | "motivation-company"
>;

export interface GuardApplicationAnswerTemplateInput<TContext> {
  readonly context: TContext;
  readonly questionText: string;
}

export interface ApplicationAnswerTemplateRenderer<TContext, TDraft> {
  readonly render: (input: {
    readonly context: TContext;
    readonly questionKind: DraftableTemplateQuestionKind;
    readonly questionText: string;
  }) => TDraft;
}

type NonDraftableQuestionHandling = Exclude<ApplicationQuestionHandling, "draftable">;

export type GuardedApplicationAnswerTemplateResult<TDraft> =
  | {
      readonly draft: TDraft;
      readonly policy: ApplicationQuestionPolicyDto;
      readonly status: "drafted";
    }
  | {
      readonly draft: null;
      readonly policy: ApplicationQuestionPolicyDto;
      readonly reason: NonDraftableQuestionHandling;
      readonly status: "not-draftable";
    };

const draftableKind = (kind: ApplicationQuestionKind): kind is DraftableTemplateQuestionKind =>
  kind === "behavioral-star" || kind === "experience-evidence" || kind === "motivation-company";

const nonDraftableReason = (policy: ApplicationQuestionPolicyDto): NonDraftableQuestionHandling => {
  if (policy.handling === "draftable") {
    throw new Error("Application question policy is internally inconsistent.");
  }
  return policy.handling;
};

export const guardApplicationAnswerTemplateDraft = <TContext, TDraft>(
  input: GuardApplicationAnswerTemplateInput<TContext>,
  renderer: ApplicationAnswerTemplateRenderer<TContext, TDraft>,
): GuardedApplicationAnswerTemplateResult<TDraft> => {
  const rendererCandidate: unknown = renderer;
  if (
    rendererCandidate === null ||
    typeof rendererCandidate !== "object" ||
    typeof (rendererCandidate as { readonly render?: unknown }).render !== "function"
  ) {
    throw new TypeError("Application answer template renderer is invalid.");
  }
  const policy = classifyApplicationQuestion(input.questionText);
  if (!policy.allowsGeneratedDraft || !draftableKind(policy.kind)) {
    return Object.freeze({
      draft: null,
      policy,
      reason: nonDraftableReason(policy),
      status: "not-draftable" as const,
    });
  }
  return Object.freeze({
    draft: renderer.render({
      context: input.context,
      questionKind: policy.kind,
      questionText: input.questionText,
    }),
    policy,
    status: "drafted" as const,
  });
};
