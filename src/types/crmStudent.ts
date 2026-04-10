import type { Timestamp } from "firebase/firestore";

/** CRM 학생 — Firestore `students` 컬렉션 (teacherId로 소유자 구분) */
export interface CrmStudentDocument {
  teacherId: string;
  name: string;
  phone: string;
  email: string;
  createdAt: Timestamp | null;
}
