import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { PassageDeepAnalysisReportJson } from "@/types/passageDeepAnalysisReport";

export type SavedPassageDeepReport = {
  id: string;
};

function firestoreSafeAnalysis(report: PassageDeepAnalysisReportJson): PassageDeepAnalysisReportJson {
  return JSON.parse(JSON.stringify(report)) as PassageDeepAnalysisReportJson;
}

/** `users/{uid}/passage_deep_reports` */
export async function savePassageDeepReport(
  userId: string,
  passage: string,
  report: PassageDeepAnalysisReportJson,
  model: string,
): Promise<SavedPassageDeepReport> {
  const col = collection(db, "users", userId, "passage_deep_reports");
  const ref = await addDoc(col, {
    passage,
    analysis: firestoreSafeAnalysis(report),
    schemaVersion: 1,
    model: model.trim() || "unknown",
    createdAt: serverTimestamp(),
  });
  return { id: ref.id };
}
