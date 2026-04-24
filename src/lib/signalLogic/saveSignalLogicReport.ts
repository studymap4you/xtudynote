import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";

export type SavedSignalLogicReport = {
  id: string;
};

/**
 * 로그인 사용자의 `users/{uid}/signal_logic_reports` 에 분석 리포트 저장.
 */
export async function saveSignalLogicReport(
  userId: string,
  passage: string,
  report: SignalLogicAnalysisReportJson,
  model: string,
): Promise<SavedSignalLogicReport> {
  const col = collection(db, "users", userId, "signal_logic_reports");
  const ref = await addDoc(col, {
    passage,
    analysis: report,
    schemaVersion: 1,
    model,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}
