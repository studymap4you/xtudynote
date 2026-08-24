import { CSATTemplateBooklet } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export function XUniverseCSATNotebookGridTemplate(props: CSATTemplateProps) {
  return <CSATTemplateBooklet {...props} templateId="xuniverse-csat-notebook-grid-v1" />;
}
