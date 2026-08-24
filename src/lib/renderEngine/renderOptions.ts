import type { CSATRenderOptions, ResolvedCSATRenderOptions } from "@/lib/renderEngine/types";

const DEFAULT_OPTIONS: ResolvedCSATRenderOptions = {
  showDifficulty: false,
  showScore: true,
  showQuestionType: true,
  mode: "student",
  showAnswerKey: false,
  showStudyChecklist: false,
  showMotivationalCopy: true,
};

export function resolveCSATRenderOptions(options?: CSATRenderOptions): ResolvedCSATRenderOptions {
  const requested: ResolvedCSATRenderOptions = { ...DEFAULT_OPTIONS, ...options };
  return {
    ...requested,
    showAnswerKey: requested.mode === "review" && requested.showAnswerKey,
  };
}

export function canRenderCSATReviewContent(options: ResolvedCSATRenderOptions): boolean {
  return options.mode === "review";
}
