import { DEFAULT_CSAT_TEMPLATE_ID, isCSATRenderTemplateId, type CSATRenderTemplateId } from "./templateIds.ts";

export const CSAT_TEMPLATE_STORAGE_KEY = "xuniverse-csat-template";

type TemplateStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): TemplateStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getSavedCSATTemplateId(storage: TemplateStorage | null = browserStorage()): CSATRenderTemplateId {
  if (!storage) return DEFAULT_CSAT_TEMPLATE_ID;
  try {
    const saved = storage.getItem(CSAT_TEMPLATE_STORAGE_KEY);
    return isCSATRenderTemplateId(saved) ? saved : DEFAULT_CSAT_TEMPLATE_ID;
  } catch {
    return DEFAULT_CSAT_TEMPLATE_ID;
  }
}

export function saveCSATTemplateId(templateId: CSATRenderTemplateId, storage: TemplateStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CSAT_TEMPLATE_STORAGE_KEY, templateId);
  } catch {
    // Rendering still works when browser storage is unavailable.
  }
}
