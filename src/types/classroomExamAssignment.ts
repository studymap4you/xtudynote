/**
 * 선생님이 AI 시험(ai_exams)을 특정 강의실에 배포할 때 생성하는 메타 문서.
 * 컬렉션: `classroom_exam_assignments`
 */
export type ClassroomExamAssignmentDocument = {
  classroomId: string;
  teacherId: string;
  examId: string;
  title: string;
  subject: string;
  createdAt: unknown;
};
