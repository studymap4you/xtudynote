import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";

export async function getClassroomIfTeacher(
  classroomId: string,
  teacherId: string
): Promise<ClassroomDocument | null> {
  const snap = await getDoc(doc(db, "classrooms", classroomId));
  if (!snap.exists()) return null;
  const d = snap.data() as ClassroomDocument;
  return d.teacherId === teacherId ? d : null;
}
