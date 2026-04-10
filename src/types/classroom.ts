/** 강의실 — 선생님이 개설, 학생은 목록에서 입장 */
export interface ClassroomDocument {
  teacherId: string;
  title: string;
  description: string;
  createdAt: unknown;
}
