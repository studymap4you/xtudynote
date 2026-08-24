import { CSATTemplateBooklet } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export function XUniverseCSATMonoHighlighterTemplate(props: CSATTemplateProps) {
  return <CSATTemplateBooklet {...props} templateId="xuniverse-csat-mono-highlighter-v1" />;
}
