import { CSATTemplateBooklet } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export function XUniverseCSATStudygramTemplate(props: CSATTemplateProps) {
  return <CSATTemplateBooklet {...props} templateId="xuniverse-csat-studygram-pop-v1" />;
}
