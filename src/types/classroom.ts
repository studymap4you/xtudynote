/** 강의 요금 구분 — 유료는 목록·상세에 안내 가격 표시용(실제 결제·수강 정책은 별도) */
export type ClassroomPricingType = "free" | "paid";

/**
 * 홈 비로그인 「강의신청」목록용 — classrooms 본문과 별도(멤버 UID 미포함).
 * 문서 ID = classroomId.
 */
export interface ClassroomPublicListingDocument {
  classroomId: string;
  title: string;
  description: string;
  pricingType?: ClassroomPricingType;
  tuitionFeeKrw?: number;
  listedAt: unknown;
}

/** 강의실 — 선생님이 개설, 학생은 목록에서 입장 */
export interface ClassroomDocument {
  teacherId: string;
  title: string;
  /** 무료(기본) 또는 유료 표시. 멤버 등록 방식은 앱·규칙에서 정의 (미설정 시 무료로 간주) */
  pricingType?: ClassroomPricingType;
  /** 유료(`pricingType === "paid"`)일 때 수강 안내 가격(원, 정수) */
  tuitionFeeKrw?: number;
  /** 짧은 요약·한 줄 안내 (개설 시) */
  description: string;
  /** 강의 소개 본문 (관리 화면에서 편집, 비어 있으면 description 표시) */
  introduction?: string;
  /** 학습지 배포 등에 쓸 학생 Firebase Auth UID 목록 (선생님이 관리 화면에서 편집) */
  memberStudentIds?: string[];
  /** 마스터 지식 큐레이션에서 생성한 학습자료 문서 ID (선택) */
  knowledgeMaterialId?: string;
  /**
   * 학생 강의실에 「1:1 채팅」으로 노출할 외부 채팅 링크 (보통 카카오 오픈채팅 `https://open.kakao.com/...`).
   */
  studentChatUrl?: string | null;
  /**
   * 유료 강의 — 학생이「수강신청」완료 후 새 창으로 열 결제·안내 페이지 URL(선생님 설정).
   * 결제 여부와 무관하게 선생님이 승인하면 멤버로 등록됩니다.
   */
  tuitionPaymentUrl?: string | null;
  createdAt: unknown;
}

/** 카탈로그 수강 시 저장 — classrooms/{classroomId}/member_enrollments/{studentId} */
export interface ClassroomMemberEnrollmentDocument {
  studentId: string;
  email: string;
  phone: string;
  classroomId: string;
  teacherId: string;
  classroomTitle: string;
  enrolledAt: unknown;
}

/** 유료 강의 — 전체 강의실에서 수강 신청 시 대기열 (classrooms/{id}/enrollment_requests/{studentId}) */
export interface ClassroomEnrollmentRequestDocument {
  studentId: string;
  email: string;
  phone: string;
  classroomId: string;
  teacherId: string;
  classroomTitle: string;
  requestedAt: unknown;
}

/** 강의실 질의응답 (스레드: parentPostId 가 null 이면 질문, 아니면 답글) */
export interface ClassroomQaPostDocument {
  authorId: string;
  authorName: string;
  body: string;
  parentPostId: string | null;
  createdAt: unknown;
}

/** 강의실별 공지사항 (classrooms/{id}/notices) */
export interface ClassroomNoticeDocument {
  body: string;
  createdAt: unknown;
}
