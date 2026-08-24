import { CSATTemplateBooklet } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export function XUniverseCSATCampusTechTemplate(props: CSATTemplateProps) {
  return <CSATTemplateBooklet {...props} templateId="xuniverse-csat-campus-tech-blue-v1" />;
}
