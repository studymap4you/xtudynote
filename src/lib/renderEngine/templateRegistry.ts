import type { ComponentType } from "react";
import {
  XUniverseCSATStudygramTemplate,
  type XUniverseCSATStudygramTemplateProps,
} from "@/components/renderEngine/templates/XUniverseCSATStudygramTemplate";
import type { CSATRenderTemplateId } from "@/lib/renderEngine/types";

type RenderTemplateDefinition = {
  name: string;
  version: number;
  component: ComponentType<XUniverseCSATStudygramTemplateProps>;
};

export const renderTemplates: Record<CSATRenderTemplateId, RenderTemplateDefinition> = {
  "xuniverse-csat-studygram-pop-v1": {
    name: "XUniverse CSAT Studygram Pop",
    version: 1,
    component: XUniverseCSATStudygramTemplate,
  },
};
