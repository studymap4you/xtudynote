import type { ContentType } from "@/types/content";

export type MaterialRequestStatus = "pending" | "approved" | "rejected";

export interface MaterialRequestDocument {
  studentId: string;
  materialType: ContentType;
  subject: string;
  audienceGrade: string;
  section: string;
  description: string;
  /** 유료일 때만 (원) */
  desiredPrice: number | null;
  learningMaterialFilePaths: string[];
  referenceMaterialFilePaths: string[];
  status: MaterialRequestStatus;
  createdAt: unknown;
}
