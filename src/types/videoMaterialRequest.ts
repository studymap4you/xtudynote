import type { UserRole } from "@/types/user";

export type VideoMaterialRequestStatus = "pending" | "approved" | "rejected";

/** 동영상 학습자료 등록 신청 (링크 방식) */
export interface VideoMaterialRequestDocument {
  submitterId: string;
  submitterRole: Extract<UserRole, "student" | "teacher" | "super_admin">;
  title: string;
  subject: string;
  audienceGrade: string;
  /** YouTube, Vimeo 등 공개 재생 URL */
  videoUrl: string;
  description: string;
  status: VideoMaterialRequestStatus;
  createdAt: unknown;
}
