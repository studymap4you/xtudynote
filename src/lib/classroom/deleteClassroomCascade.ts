import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

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
 * 서브컬렉션(레거시 enrollment_requests·qa_posts·notices)을 먼저 지운 뒤 강의실 문서 삭제.
 * Firestore 규칙상 멤버 0명일 때만 교사 삭제가 허용된다.
 */
export async function deleteClassroomCascade(db: Firestore, classroomId: string): Promise<void> {
  const base = ["classrooms", classroomId] as const;
  await deleteAllInCollection(db, [...base, "enrollment_requests"]);
  await deleteAllInCollection(db, [...base, "qa_posts"]);
  await deleteAllInCollection(db, [...base, "notices"]);
  await deleteDoc(doc(db, "classrooms", classroomId));
}
