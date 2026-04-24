import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";

export type SavedSignalLogicReport = {
  id: string;
};

/**
 * 로그인 사용자의 `users/{uid}/signal_logic_reports` 에 분석 리포트 저장.
 */
/** Firestore는 `undefined` 필드를 허용하지 않음 — JSON 직렬화로 잔여 undefined 제거 */
function firestoreSafeAnalysis(report: SignalLogicAnalysisReportJson): SignalLogicAnalysisReportJson {
  return JSON.parse(JSON.stringify(report)) as SignalLogicAnalysisReportJson;
}

export async function saveSignalLogicReport(
  userId: string,
  passage: string,
  report: SignalLogicAnalysisReportJson,
  model: string,
): Promise<SavedSignalLogicReport> {
  const col = collection(db, "users", userId, "signal_logic_reports");
  const ref = await addDoc(col, {
    passage,
    analysis: firestoreSafeAnalysis(report),
    schemaVersion: 1,
    model: model.trim() || "unknown",
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}
