/** Firestore `users/{teacherUid}/worksheet_roster/{studentUid}` */
export type WorksheetRosterEntryDoc = {
  studentUid: string;
  displayName?: string;
  /** 비교용 소문자 이메일 */
  emailLower?: string;
  /** 카탈로그 수강 시 학생이 기록 — 멤버 검증용 */
  classroomId?: string;
  createdAt: unknown;
};

/** Firestore `users/{teacherUid}/worksheet_groups/{groupId}` */
export type WorksheetGroupDoc = {
  name: string;
  studentUids: string[];
  createdAt: unknown;
};

export type RosterCandidate = {
  studentUid: string;
  /** 표시용 (없으면 UID 앞부분) */
  displayName: string;
  emailLower: string;
  /** 예: 강의실「수1반」, 주소록 */
  sourceLabels: string[];
};
