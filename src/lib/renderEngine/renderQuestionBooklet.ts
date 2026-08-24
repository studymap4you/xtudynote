import { normalizeCSATQuestions } from "@/lib/renderEngine/normalizeQuestions";
import { attachConceptsToQuestions } from "@/lib/conceptAssembly/attachConceptsToQuestions";
import { buildConceptRenderUnits } from "@/lib/conceptAssembly/buildConceptRenderUnits";
import { buildCSATExplanationUnits } from "@/lib/renderEngine/paginateExplanationUnits";
import { buildCSATRenderUnits } from "@/lib/renderEngine/paginateQuestionUnits";
import { resolveCSATRenderOptions } from "@/lib/renderEngine/renderOptions";
import { DEFAULT_CSAT_TEMPLATE_ID, isCSATRenderTemplateId } from "@/lib/renderEngine/templateIds";
import type { CSATRenderInput, PreparedCSATBooklet } from "@/lib/renderEngine/types";

export function renderQuestionBooklet(input: CSATRenderInput): PreparedCSATBooklet {
  const content = attachConceptsToQuestions(input.conceptSection, input.questions);
  const conceptSection = content.sections.find((section) => section.type === "concept");
  const questionSection = content.sections.find((section) => section.type === "questions");
  const normalized = normalizeCSATQuestions(questionSection ? [...questionSection.questions] : []);
  const options = resolveCSATRenderOptions(input.options);
  return {
    title: input.title.trim() || "English CSAT Practice Set",
    subtitle: input.subtitle?.trim() || undefined,
    target: input.target?.trim() || undefined,
    templateId: isCSATRenderTemplateId(input.templateId) ? input.templateId : DEFAULT_CSAT_TEMPLATE_ID,
    options,
    conceptSection,
    conceptUnits: buildConceptRenderUnits(conceptSection),
    questions: normalized.questions,
    units: buildCSATRenderUnits(normalized.questions),
    explanationUnits: buildCSATExplanationUnits(normalized.questions),
    issues: normalized.issues,
  };
}
