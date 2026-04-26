import type {
  PassageDeepAnalysisReportJson,
  PassageDeepBilingualBlock,
  PassageDeepSentenceBlock,
} from "@/types/passageDeepAnalysisReport";

const EMPTY_PAIR: PassageDeepBilingualBlock = { english: "—", koreanExplanation: "—" };

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

/** 객체 형태 또는 구 단일 string(레거시) → 병기 블록 */
function normalizeBilingual(raw: unknown, legacyString?: string): PassageDeepBilingualBlock {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const english = String(o.english ?? o.en ?? "").trim();
    const koreanExplanation = String(
      o.koreanExplanation ?? o.korean ?? o.ko ?? o.gloss ?? "",
    ).trim();
    if (english || koreanExplanation) {
      return {
        english: english || "—",
        koreanExplanation: koreanExplanation || "—",
      };
    }
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t) return { english: "—", koreanExplanation: t };
  }
  if (legacyString != null && legacyString.trim()) {
    return { english: "—", koreanExplanation: legacyString.trim() };
  }
  return { ...EMPTY_PAIR };
}

/** 레거시: 한 줄에 "term — 설명" / "term: 설명" / "term · 설명" */
function normalizeLineArray(raw: unknown): PassageDeepBilingualBlock[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw
    .map((x) => normalizeBilingual(x))
    .filter((b) => b.english !== "—" || b.koreanExplanation !== "—");
  return rows.length > 0 ? rows : null;
}

/** 레거시 단일 블록(영어 나열 + 한국어 한 덩어리) → 가능하면 여러 줄로 분해, 아니면 한 줄 유지 */
function legacySummaryToLines(block: PassageDeepBilingualBlock): PassageDeepBilingualBlock[] {
  if (block.english === "—" && block.koreanExplanation === "—") {
    return [{ ...EMPTY_PAIR }];
  }
  const enLines = block.english
    .split(/\s*(?:\r?\n|•)\s*/)
    .map((s) => s.replace(/^[,\s]+/u, "").replace(/^[-*]\s*/u, "").trim())
    .filter(Boolean);
  const koLines = block.koreanExplanation
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (enLines.length <= 1 && koLines.length <= 1) {
    return [{ ...block }];
  }
  const n = Math.max(enLines.length, koLines.length);
  const out: PassageDeepBilingualBlock[] = [];
  for (let i = 0; i < n; i++) {
    const english = enLines[i] ?? enLines[enLines.length - 1] ?? "—";
    const koreanExplanation = koLines[i] ?? koLines[koLines.length - 1] ?? "—";
    if (english !== "—" || koreanExplanation !== "—") {
      out.push({ english, koreanExplanation });
    }
  }
  return out.length > 0 ? out : [{ ...block }];
}

function normalizeKeyLineList(listRaw: unknown, legacyBlockRaw: unknown): PassageDeepBilingualBlock[] {
  const fromArray = normalizeLineArray(listRaw);
  if (fromArray) return fromArray;

  const legacyBlock = normalizeBilingual(
    legacyBlockRaw,
    typeof legacyBlockRaw === "string" ? legacyBlockRaw : undefined,
  );
  return legacySummaryToLines(legacyBlock);
}

function vocabItemsFromLegacyString(s: string): PassageDeepBilingualBlock[] {
  const lines = s
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: PassageDeepBilingualBlock[] = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s*(?:[·:—\-]|\s-\s)\s*(.+)$/u);
    if (m) {
      out.push({ english: m[1].trim() || "—", koreanExplanation: m[2].trim() || "—" });
    } else {
      out.push({ english: "—", koreanExplanation: line });
    }
  }
  return out.length > 0 ? out : [{ ...EMPTY_PAIR }];
}

function normalizeKeyVocabItems(o: Record<string, unknown>): PassageDeepBilingualBlock[] {
  const rawItems = o.keyVocabItems;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const items = rawItems
      .map((x) => normalizeBilingual(x))
      .filter((b) => b.english !== "—" || b.koreanExplanation !== "—");
    if (items.length > 0) return items;
  }
  const legacy = String(o.keyVocabOrExpressions ?? "").trim();
  if (legacy) return vocabItemsFromLegacyString(legacy);
  return [{ ...EMPTY_PAIR }];
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
    keyVocabItems: normalizeKeyVocabItems(o),
  };
}

export function normalizePassageDeepReport(raw: unknown): PassageDeepAnalysisReportJson {
  const base: PassageDeepAnalysisReportJson = {
    schemaVersion: 1,
    theme: { ...EMPTY_PAIR },
    passageTitle: { ...EMPTY_PAIR },
    keyExpressionsList: [{ ...EMPTY_PAIR }],
    keyGrammarSyntaxList: [{ ...EMPTY_PAIR }],
    sentences: [],
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  base.theme = normalizeBilingual(o.theme, typeof o.theme === "string" ? o.theme : undefined);
  base.passageTitle = normalizeBilingual(
    o.passageTitle,
    typeof o.passageTitle === "string" ? o.passageTitle : undefined,
  );
  base.keyExpressionsList = normalizeKeyLineList(
    o.keyExpressionsList ?? o.keyExpressionsLines,
    o.keyExpressionsSummary,
  );
  base.keyGrammarSyntaxList = normalizeKeyLineList(
    o.keyGrammarSyntaxList ?? o.keyGrammarLines,
    o.keyGrammarSyntax,
  );

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
