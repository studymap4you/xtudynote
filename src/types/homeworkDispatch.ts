import type { Timestamp } from "firebase/firestore";

export interface HomeworkDispatchRecipient {
  studentId: string;
  name: string;
  email: string;
  phone: string;
}

/** 과제 안내 일괄 발송 기록 — `homework_dispatches` */
export interface HomeworkDispatchDocument {
  teacherId: string;
  homeworkCode: string;
  message: string;
  recipientStudentIds: string[];
  recipients: HomeworkDispatchRecipient[];
  createdAt: Timestamp | null;
}
