/** 강의 요금 구분 — 유료는 수강 신청(연락처) 후 강사 승인·추후 PG 결제 연동 */
export type ClassroomPricingType = "free" | "paid";

/** 강의실 — 선생님이 개설, 학생은 목록에서 입장 */
export interface ClassroomDocument {
  teacherId: string;
  title: string;
  /** 무료: 학생이 직접 멤버 등록. 유료: enrollment_requests 후 강사 승인 (미설정 시 무료로 간주) */
  pricingType?: ClassroomPricingType;
  /** 유료(`pricingType === "paid"`)일 때 수강 가격(원, 정수). 학생 카탈로그·신청 팝업에 표시 */
  tuitionFeeKrw?: number;
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

/** 강의실 유료 수강 신청 (문서 ID = 학생 UID, 한 강의실당 1건 유지) */
export type ClassroomEnrollmentRequestStatus = "pending" | "approved" | "rejected";

export interface ClassroomEnrollmentRequestDocument {
  studentId: string;
  phone: string;
  email: string;
  status: ClassroomEnrollmentRequestStatus;
  createdAt: unknown;
  reviewedAt?: unknown;
  displayName?: string;
  /** 신청 시점에 강의실에 표시된 수강가(원) — 안내·분쟁 시 참고 */
  tuitionFeeKrwAtRequest?: number;
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
