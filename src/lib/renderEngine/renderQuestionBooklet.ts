import { normalizeCSATQuestions } from "@/lib/renderEngine/normalizeQuestions";
import { buildCSATRenderUnits } from "@/lib/renderEngine/paginateQuestionUnits";
import { resolveCSATRenderOptions } from "@/lib/renderEngine/renderOptions";
import type { CSATRenderInput, PreparedCSATBooklet } from "@/lib/renderEngine/types";

export function renderQuestionBooklet(input: CSATRenderInput): PreparedCSATBooklet {
  const normalized = normalizeCSATQuestions(input.questions);
  const options = resolveCSATRenderOptions(input.options);
  return {
    title: input.title.trim() || "English CSAT Practice Set",
    subtitle: input.subtitle?.trim() || undefined,
    target: input.target?.trim() || undefined,
    templateId: input.templateId,
    options,
    questions: normalized.questions,
    units: buildCSATRenderUnits(normalized.questions),
    issues: normalized.issues,
  };
}
