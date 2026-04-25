/** 강의실 — 선생님이 개설, 학생은 목록에서 입장 */
export interface ClassroomDocument {
  teacherId: string;
  title: string;
  /** 짧은 요약·한 줄 안내 (개설 시) */
  description: string;
  /** 강의 소개 본문 (관리 화면에서 편집, 비어 있으면 description 표시) */
  introduction?: string;
  /** 학습지 배포 등에 쓸 학생 Firebase Auth UID 목록 (선생님이 관리 화면에서 편집) */
  memberStudentIds?: string[];
  /** 마스터 지식 큐레이션에서 생성한 학습자료 문서 ID (선택) */
  knowledgeMaterialId?: string;
  createdAt: unknown;
}

/** 강의실 질의응답 (스레드: parentPostId 가 null 이면 질문, 아니면 답글) */
export interface ClassroomQaPostDocument {
  authorId: string;
  authorName: string;
  body: string;
  parentPostId: string | null;
  createdAt: unknown;
}
