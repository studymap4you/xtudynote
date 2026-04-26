import { normalizeAnalysisReport } from "@/lib/signalLogic/normalizeAnalysisReport";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { SignalLogicPassageAnalysis } from "@/types/signalLogicReading";

function clipTitle(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t || "분석 리포트";
  return `${t.slice(0, max).trim()}…`;
}

function formatAnalyzedAt(createdAt: unknown): string {
  if (createdAt && typeof createdAt === "object" && createdAt !== null && "toDate" in createdAt) {
    const d = (createdAt as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}.${m}.${day}`;
    }
  }
  return "—";
}

/** Firestore `signal_logic_reports` 문서 → 대시보드 카드용 타입 */
export function savedReportDocToPassageAnalysis(
  docId: string,
  passage: string,
  analysis: SignalLogicAnalysisReportJson,
  createdAt: unknown,
): SignalLogicPassageAnalysis {
  const a = normalizeAnalysisReport(analysis);
  const binaryLogic = a.binaryOppositions.flatMap((b) => [
    { bucket: "A" as const, keyword: b.poleA },
    { bucket: "B" as const, keyword: b.poleB },
  ]);

  const signals = a.coreSignalWords.map((s) => ({
    word: s.word,
    logicRole: s.functionTag ? `${s.role} · ${s.functionTag}` : s.role,
  }));
  const one = a.oneShotSignalWord?.trim();
  if (one && !signals.some((x) => x.word.toLowerCase() === one.toLowerCase())) {
    signals.unshift({ word: one, logicRole: "One-Shot" });
  }

  return {
    id: docId,
    title: clipTitle(a.topicThesis, 52),
    analyzedAt: formatAnalyzedAt(createdAt),
    originalText: passage,
    translation: a.analysisNarrative.trim() || a.topicThesis,
    vocabulary: a.vocabularyItems.map((v) => ({ term: v.term, gloss: v.gloss })),
    binaryLogic,
    signals,
  };
}
