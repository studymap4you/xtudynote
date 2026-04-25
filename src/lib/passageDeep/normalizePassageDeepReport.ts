import type {
  PassageDeepAnalysisReportJson,
  PassageDeepSentenceBlock,
} from "@/types/passageDeepAnalysisReport";

function normalizeMeaningUnits(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSentence(raw: unknown, fallbackIndex: number): PassageDeepSentenceBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sentenceEnglish = String(o.sentenceEnglish ?? "").trim();
  if (!sentenceEnglish) return null;
  const idx = Number(o.sentenceIndex);
  return {
    sentenceIndex: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : fallbackIndex,
    sentenceEnglish,
    meaningUnits: normalizeMeaningUnits(o.meaningUnits),
    literalTranslation: String(o.literalTranslation ?? "").trim() || "—",
    professionalInterpretation: String(o.professionalInterpretation ?? "").trim() || "—",
    keyVocabOrExpressions: String(o.keyVocabOrExpressions ?? "").trim() || "—",
  };
}

export function normalizePassageDeepReport(raw: unknown): PassageDeepAnalysisReportJson {
  const base: PassageDeepAnalysisReportJson = {
    schemaVersion: 1,
    theme: "—",
    passageTitle: "—",
    keyExpressionsSummary: "—",
    keyGrammarSyntax: "—",
    sentences: [],
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (Number(o.schemaVersion) !== 1) {
    /* still try to read fields */
  }
  base.theme = String(o.theme ?? "").trim() || base.theme;
  base.passageTitle = String(o.passageTitle ?? "").trim() || base.passageTitle;
  base.keyExpressionsSummary = String(o.keyExpressionsSummary ?? "").trim() || base.keyExpressionsSummary;
  base.keyGrammarSyntax = String(o.keyGrammarSyntax ?? "").trim() || base.keyGrammarSyntax;

  const rawList = Array.isArray(o.sentences) ? o.sentences : [];
  const sentences: PassageDeepSentenceBlock[] = [];
  let i = 1;
  for (const item of rawList) {
    const s = normalizeSentence(item, i);
    if (s) {
      sentences.push({ ...s, sentenceIndex: i });
      i += 1;
    }
  }
  base.sentences = sentences;
  return base;
}
