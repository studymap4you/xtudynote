/** 영상 링크·업로드 파일 (레슨당 여러 개) */
export interface LessonVideoItem {
  id: string;
  url: string;
  /** 표시용 이름 (파일명 등) */
  label?: string;
  /** Firebase Storage 전체 경로 — 삭제 시 사용 */
  storagePath?: string | null;
}

/** 학습 자료 — 라이브러리 콘텐츠 ID·URL·업로드 파일 (레슨당 여러 개) */
export interface LessonMaterialItem {
  id: string;
  contentId?: string | null;
  url?: string | null;
  label?: string;
  storagePath?: string | null;
}

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
  /** @deprecated 단일 영상 URL — `videoItems`로 대체 */
  videoUrl?: string | null;
  /** @deprecated 단일 콘텐츠 ID — `materialItems`로 대체 */
  contentId?: string | null;
  /** 영상(외부 URL 또는 Storage 업로드) 목록 */
  videoItems?: LessonVideoItem[] | null;
  /** 학습 자료(콘텐츠·URL·파일) 목록 */
  materialItems?: LessonMaterialItem[] | null;
  createdAt: unknown;
  updatedAt: unknown;
}

/** `classrooms/{classroomId}/student_lesson_progress/{studentUid}` */
export interface StudentLessonProgressDocument {
  completedLessonIds: string[];
  updatedAt: unknown;
}
