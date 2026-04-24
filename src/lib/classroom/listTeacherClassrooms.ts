import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";

export type ClassroomRow = { id: string; data: ClassroomDocument };

function createdMs(at: unknown): number {
  if (at && typeof at === "object" && at !== null && "toMillis" in at) {
    const t = (at as { toMillis: () => number }).toMillis();
    return typeof t === "number" ? t : 0;
  }
  return 0;
}

/** 내가 개설한 강의실 목록 (복합 색인 없이 `where`만 사용 후 생성일 기준 정렬) */
export async function listClassroomsByTeacher(teacherUid: string): Promise<ClassroomRow[]> {
  const q = query(collection(db, "classrooms"), where("teacherId", "==", teacherUid));
  const snap = await getDocs(q);
  const rows: ClassroomRow[] = [];
  snap.forEach((d) => rows.push({ id: d.id, data: d.data() as ClassroomDocument }));
  rows.sort((a, b) => createdMs(b.data.createdAt) - createdMs(a.data.createdAt));
  return rows;
}
