/** `classrooms/{classroomId}/lessons/{lessonId}` — 선생님이 정한 레슨·단원 순서 */
export interface ClassroomLessonDocument {
  /** 표시 순서 (오름차순) */
  orderIndex: number;
  /** 단원 제목 (선택) */
  unitTitle?: string;
  /** 레슨 제목 */
  title: string;
  /** 학생 화면 아코디언용 요약 (선택) */
  summary?: string;
  /** 외부 영상 URL (선택) */
  videoUrl?: string | null;
  /** 라이브러리 콘텐츠 ID — 승인된 자료 상세로 연결 (선택) */
  contentId?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

/** `classrooms/{classroomId}/student_lesson_progress/{studentUid}` */
export interface StudentLessonProgressDocument {
  completedLessonIds: string[];
  updatedAt: unknown;
}
