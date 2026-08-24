export const CSAT_TEMPLATE_IDS = [
  "xuniverse-csat-studygram-pop-v1",
  "xuniverse-csat-campus-tech-blue-v1",
  "xuniverse-csat-premium-stationery-v1",
  "xuniverse-csat-mono-highlighter-v1",
  "xuniverse-csat-editorial-magazine-v1",
  "xuniverse-csat-notebook-grid-v1",
] as const;

export type CSATRenderTemplateId = (typeof CSAT_TEMPLATE_IDS)[number];
export type CSATTemplateId = CSATRenderTemplateId;

export const DEFAULT_CSAT_TEMPLATE_ID: CSATRenderTemplateId = "xuniverse-csat-studygram-pop-v1";

export function isCSATRenderTemplateId(value: unknown): value is CSATRenderTemplateId {
  return typeof value === "string" && (CSAT_TEMPLATE_IDS as readonly string[]).includes(value);
}
