import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { parseHomeworkRouteParam } from "@/lib/homeworkCode";
import type { HomeworkCodeDocument } from "@/types/content";

/**
 * `/homework/:code` 또는 검색에서 넘어온 문자열로 과제 메타 문서를 조회합니다.
 * PIN(4자리)은 `homework_codes.shortCode` 필드로 조회합니다.
 */
export async function getHomeworkCodeDocByRouteParam(
  param: string
): Promise<{ docId: string; data: HomeworkCodeDocument } | null> {
  const parsed = parseHomeworkRouteParam(param);
  if (!parsed) return null;

  if (parsed.kind === "full") {
    const ref = doc(db, "homework_codes", parsed.code);
    const s = await getDoc(ref);
    if (!s.exists()) return null;
    return { docId: s.id, data: s.data() as HomeworkCodeDocument };
  }

  const q = query(
    collection(db, "homework_codes"),
    where("shortCode", "==", parsed.pin),
    limit(2)
  );
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  if (snaps.size > 1) return null;
  const d = snaps.docs[0];
  return { docId: d.id, data: d.data() as HomeworkCodeDocument };
}
