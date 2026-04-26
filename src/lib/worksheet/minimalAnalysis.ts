import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";

export function minimalAnalysisForAssignment(title: string): SignalLogicAnalysisReportJson {
  return {
    schemaVersion: 1,
    topicThesis: title.trim() || "학습지",
    oneShotSignalWord: "",
    coreSignalWords: [],
    binaryOppositions: [],
    analysisNarrative: "",
    vocabularyItems: [],
  };
}
