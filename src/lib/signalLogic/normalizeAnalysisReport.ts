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
      return {
        word,
        role: asString(o.role).trim() || "시그널",
        functionTag: asString(o.functionTag).trim() || undefined,
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
      return {
        poleA,
        poleB,
        axisLabel: asString(o.axisLabel).trim() || "대립 축",
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

/** AI JSON을 고정 스키마로 정규화 (누락 필드 보정). */
export function normalizeAnalysisReport(raw: unknown): SignalLogicAnalysisReportJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: 1,
    topicThesis: asString(o.topicThesis).trim() || "주제문을 추출하지 못했습니다.",
    coreSignalWords: normalizeSignals(o.coreSignalWords),
    binaryOppositions: normalizeBinary(o.binaryOppositions),
    analysisNarrative: asString(o.analysisNarrative).trim() || "",
    vocabularyItems: normalizeVocab(o.vocabularyItems),
    signalOneShotNotes: normalizeNotes(o.signalOneShotNotes),
  };
}
