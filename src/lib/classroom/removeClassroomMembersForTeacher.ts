import { writeBatch, doc, type DocumentReference } from "firebase/firestore";
import { db } from "@/firebase/config";
import { listClassroomsByTeacher } from "@/lib/classroom/listTeacherClassrooms";
import { syncTeacherRosterForClassroomMemberDelta } from "@/lib/worksheet/teacherRosterApi";

type BatchOp =
  | { kind: "update"; ref: DocumentReference; data: { memberStudentIds: string[] } }
  | { kind: "delete"; ref: DocumentReference };

const MAX_BATCH = 450;

/**
 * 선생님이 개설한 모든 강의실에서, 선택한 학생 UID를 멤버·member_enrollments에서 제거합니다.
 */
export async function removeClassroomMembersForTeacher(teacherUid: string, studentUids: string[]): Promise<void> {
  const removeSet = new Set(studentUids.map((s) => s.trim()).filter((u) => u.length >= 8));
  if (!removeSet.size) return;

  const rooms = await listClassroomsByTeacher(teacherUid);
  const ops: BatchOp[] = [];

  for (const row of rooms) {
    const cid = row.id;
    const members = [...(row.data.memberStudentIds ?? [])].map((u) => String(u).trim());
    const toStrip = members.filter((u) => removeSet.has(u));
    if (toStrip.length === 0) continue;
    const nextMembers = members.filter((u) => !removeSet.has(u));
    const cRef = doc(db, "classrooms", cid);
    ops.push({ kind: "update", ref: cRef, data: { memberStudentIds: nextMembers } });
    for (const suid of toStrip) {
      ops.push({
        kind: "delete",
        ref: doc(db, "classrooms", cid, "member_enrollments", suid),
      });
    }
  }

  for (let i = 0; i < ops.length; i += MAX_BATCH) {
    const chunk = ops.slice(i, i + MAX_BATCH);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.kind === "update") batch.update(op.ref, op.data);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }

  await syncTeacherRosterForClassroomMemberDelta(teacherUid, {
    added: [],
    removed: [...removeSet],
  });
}
