import { CSATTemplateBooklet } from "@/components/renderEngine/templates/CSATTemplateBooklet";
import type { CSATTemplateProps } from "@/lib/renderEngine/types";

export function XUniverseCSATPremiumStationeryTemplate(props: CSATTemplateProps) {
  return <CSATTemplateBooklet {...props} templateId="xuniverse-csat-premium-stationery-v1" />;
}
