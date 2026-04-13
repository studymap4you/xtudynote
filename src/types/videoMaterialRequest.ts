import type { ContentType } from "@/types/content";
import type { LearningThemeId } from "@/types/learningTheme";
import type { UserRole } from "@/types/user";

export type VideoMaterialRequestStatus = "pending" | "approved" | "rejected";

/** 동영상 학습자료 등록 신청 (링크 방식) */
export interface VideoMaterialRequestDocument {
  submitterId: string;
  submitterRole: Extract<UserRole, "student" | "teacher" | "super_admin">;
  title: string;
  subject: string;
  audienceGrade: string;
  materialType: ContentType;
  /** YouTube, Vimeo 등 공개 재생 URL (복수일 때 첫 링크와 동일하게 유지) */
  videoUrl: string;
  /** 복수 링크 — 없으면 videoUrl 단일 값으로 간주 */
  videoUrls?: string[];
  description: string;
  /** 유료일 때만 (원) */
  desiredPrice: number | null;
  /** 과제 유형일 때만 */
  homeworkInstruction: string | null;
  themes?: LearningThemeId[];
  thumbnailPendingPath?: string | null;
  status: VideoMaterialRequestStatus;
  /** 강의실 연동 시 */
  classroomId?: string | null;
  createdAt: unknown;
  resolvedContentId?: string | null;
  reviewedAt?: unknown;
}
