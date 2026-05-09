import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { deleteClassroomPublicListing } from "@/lib/classroom/classroomPublicListing";

const BATCH_SIZE = 450;

async function deleteAllInCollection(
  db: Firestore,
  pathSegments: readonly [string, ...string[]]
): Promise<void> {
  const colRef = collection(db, ...pathSegments);
  const snap = await getDocs(colRef);
  if (snap.empty) return;

  let batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

/**
 * 서브컬렉션(member_enrollments·레거시 enrollment_requests·qa_posts·notices)을 먼저 지운 뒤 강의실 문서 삭제.
 * Firestore 규칙상 멤버 0명일 때만 교사 삭제가 허용된다.
 */
export async function deleteClassroomCascade(db: Firestore, classroomId: string): Promise<void> {
  try {
    await deleteClassroomPublicListing(db, classroomId);
  } catch {
    /* 문서가 없거나 규칙 오류 시에도 본편 삭제는 진행 */
  }
  const base = ["classrooms", classroomId] as const;
  await deleteAllInCollection(db, [...base, "member_enrollments"]);
  await deleteAllInCollection(db, [...base, "enrollment_requests"]);
  await deleteAllInCollection(db, [...base, "qa_posts"]);
  await deleteAllInCollection(db, [...base, "notices"]);
  await deleteAllInCollection(db, [...base, "lessons"]);
  await deleteAllInCollection(db, [...base, "student_lesson_progress"]);
  await deleteDoc(doc(db, "classrooms", classroomId));
}
