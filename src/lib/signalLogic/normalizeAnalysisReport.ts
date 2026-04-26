import type {
  SignalLogicAnalysisReportJson,
  SignalLogicBinaryOpposition,
  SignalLogicCoreSignalWord,
  SignalLogicVocabItem,
} from "@/types/signalLogicAnalysisReport";

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeSignals(raw: unknown): SignalLogicCoreSignalWord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const word = asString(o.word).trim();
      if (!word) return null;
      const ft = asString(o.functionTag).trim();
      const phenomenonKo = asString(o.phenomenonKo).trim();
      const evidenceQuote = asString(o.evidenceQuote ?? o.quoteFromPassage).trim();
      const explanationKo = asString(o.explanationKo ?? o.logicalExplanationKo).trim();
      const flowKo = asString(o.flowKo ?? o.flowSummaryKo).trim();
      return {
        word,
        role: asString(o.role).trim() || "시그널",
        ...(ft ? { functionTag: ft } : {}),
        ...(phenomenonKo ? { phenomenonKo } : {}),
        ...(evidenceQuote ? { evidenceQuote } : {}),
        ...(explanationKo ? { explanationKo } : {}),
        ...(flowKo ? { flowKo } : {}),
      };
    })
    .filter(Boolean) as SignalLogicCoreSignalWord[];
}

function normalizeBinary(raw: unknown): SignalLogicBinaryOpposition[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const poleA = asString(o.poleA).trim();
      const poleB = asString(o.poleB).trim();
      if (!poleA || !poleB) return null;
      const keySentenceQuote = asString(o.keySentenceQuote ?? o.oppositionEvidenceQuote).trim();
      const rationaleKo = asString(o.rationaleKo ?? o.keywordRationaleKo).trim();
      const relationKo = asString(o.relationKo ?? o.relationNarrativeKo).trim();
      return {
        poleA,
        poleB,
        axisLabel: asString(o.axisLabel).trim() || "대립 축",
        ...(keySentenceQuote ? { keySentenceQuote } : {}),
        ...(rationaleKo ? { rationaleKo } : {}),
        ...(relationKo ? { relationKo } : {}),
      };
    })
    .filter(Boolean) as SignalLogicBinaryOpposition[];
}

function normalizeVocab(raw: unknown): SignalLogicVocabItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const term = asString(o.term).trim();
      if (!term) return null;
      return { term, gloss: asString(o.gloss).trim() || "—" };
    })
    .filter(Boolean) as SignalLogicVocabItem[];
}

function normalizeNotes(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.map((x) => asString(x).trim()).filter(Boolean);
  return list.length ? list : undefined;
}

/** AI JSON을 고정 스키마로 정규화 (누락 필드 보정). Firestore 저장 시 undefined 키를 넣지 않음. */
export function normalizeAnalysisReport(raw: unknown): SignalLogicAnalysisReportJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const notes = normalizeNotes(o.signalOneShotNotes);
  const coreSignalWords = normalizeSignals(o.coreSignalWords);
  const oneShotSignalWord =
    asString(o.oneShotSignalWord).trim() || (coreSignalWords[0]?.word ?? "").trim() || "—";

  const base: SignalLogicAnalysisReportJson = {
    schemaVersion: 1,
    topicThesis: asString(o.topicThesis).trim() || "주제문을 추출하지 못했습니다.",
    oneShotSignalWord,
    coreSignalWords,
    binaryOppositions: normalizeBinary(o.binaryOppositions),
    analysisNarrative: asString(o.analysisNarrative).trim() || "",
    vocabularyItems: normalizeVocab(o.vocabularyItems),
  };
  return notes?.length ? { ...base, signalOneShotNotes: notes } : base;
}
