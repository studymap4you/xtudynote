export const DEFAULT_CSAT_GENERATION_MODE = "textbook";

export function normalizeCsatGenerationMode(value) {
  return value === "exam" ? "exam" : DEFAULT_CSAT_GENERATION_MODE;
}
