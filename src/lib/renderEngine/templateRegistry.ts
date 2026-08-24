import type { ComponentType } from "react";
import { XUniverseCSATCampusTechTemplate } from "@/components/renderEngine/templates/XUniverseCSATCampusTechTemplate";
import { XUniverseCSATEditorialTemplate } from "@/components/renderEngine/templates/XUniverseCSATEditorialTemplate";
import { XUniverseCSATMonoHighlighterTemplate } from "@/components/renderEngine/templates/XUniverseCSATMonoHighlighterTemplate";
import { XUniverseCSATNotebookGridTemplate } from "@/components/renderEngine/templates/XUniverseCSATNotebookGridTemplate";
import { XUniverseCSATPremiumStationeryTemplate } from "@/components/renderEngine/templates/XUniverseCSATPremiumStationeryTemplate";
import { XUniverseCSATStudygramTemplate } from "@/components/renderEngine/templates/XUniverseCSATStudygramTemplate";
import { CSAT_TEMPLATE_IDS, DEFAULT_CSAT_TEMPLATE_ID, isCSATRenderTemplateId, type CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";
import { CSAT_TEMPLATE_TOKENS, type CSATTemplateTokens } from "@/lib/renderEngine/templates/templateTokens";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export type RenderTemplateDefinition = {
  id: CSATRenderTemplateId;
  name: string;
  shortName: string;
  description: string;
  component: ComponentType<CSATTemplateProps>;
  previewImage?: string;
  tags: string[];
  version: number;
  recommendedFor: string[];
  colorMode: "bright" | "soft" | "mono" | "editorial" | "notebook";
  isDefault?: boolean;
  tokens: CSATTemplateTokens;
};

export const renderTemplates: Record<CSATRenderTemplateId, RenderTemplateDefinition> = {
  "xuniverse-csat-studygram-pop-v1": {
    id: "xuniverse-csat-studygram-pop-v1", name: "XUniverse CSAT Studygram Pop", shortName: "Studygram Pop",
    description: "밝고 친근한 수능 워크북", component: XUniverseCSATStudygramTemplate,
    tags: ["bright", "student", "studygram"], version: 1, recommendedFor: ["일반 학습", "학생 자습"],
    colorMode: "bright", isDefault: true, tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-studygram-pop-v1"],
  },
  "xuniverse-csat-campus-tech-blue-v1": {
    id: "xuniverse-csat-campus-tech-blue-v1", name: "XUniverse Campus Tech Blue", shortName: "Campus Tech Blue",
    description: "상위권 수험생을 위한 디지털 학습 스타일", component: XUniverseCSATCampusTechTemplate,
    tags: ["cobalt", "advanced", "structured"], version: 1, recommendedFor: ["고난도", "실전 독해"],
    colorMode: "bright", tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-campus-tech-blue-v1"],
  },
  "xuniverse-csat-premium-stationery-v1": {
    id: "xuniverse-csat-premium-stationery-v1", name: "XUniverse Premium Stationery", shortName: "Premium Stationery",
    description: "부드럽고 고급스러운 스터디카페 감성", component: XUniverseCSATPremiumStationeryTemplate,
    tags: ["ivory", "soft", "premium"], version: 1, recommendedFor: ["장시간 학습", "프리미엄 교재"],
    colorMode: "soft", tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-premium-stationery-v1"],
  },
  "xuniverse-csat-mono-highlighter-v1": {
    id: "xuniverse-csat-mono-highlighter-v1", name: "XUniverse Mono Highlighter", shortName: "Mono Highlighter",
    description: "실전 시험지와 필기의 결합", component: XUniverseCSATMonoHighlighterTemplate,
    tags: ["mono", "print", "mock-exam"], version: 1, recommendedFor: ["모의고사", "프린트 · 학원"],
    colorMode: "mono", tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-mono-highlighter-v1"],
  },
  "xuniverse-csat-editorial-magazine-v1": {
    id: "xuniverse-csat-editorial-magazine-v1", name: "XUniverse Editorial Magazine", shortName: "Editorial Magazine",
    description: "고급 독해 잡지 스타일", component: XUniverseCSATEditorialTemplate,
    tags: ["editorial", "reading", "premium"], version: 1, recommendedFor: ["인문 · 사회", "고난도 독해"],
    colorMode: "editorial", tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-editorial-magazine-v1"],
  },
  "xuniverse-csat-notebook-grid-v1": {
    id: "xuniverse-csat-notebook-grid-v1", name: "XUniverse Notebook Grid", shortName: "Notebook Grid",
    description: "공부 노트와 오답 노트 스타일", component: XUniverseCSATNotebookGridTemplate,
    tags: ["notebook", "review", "homework"], version: 1, recommendedFor: ["숙제 · 복습", "자기주도학습"],
    colorMode: "notebook", tokens: CSAT_TEMPLATE_TOKENS["xuniverse-csat-notebook-grid-v1"],
  },
};

export const renderTemplateList = CSAT_TEMPLATE_IDS.map((id) => renderTemplates[id]);

export function getRenderTemplate(id: unknown): RenderTemplateDefinition {
  return renderTemplates[isCSATRenderTemplateId(id) ? id : DEFAULT_CSAT_TEMPLATE_ID];
}
