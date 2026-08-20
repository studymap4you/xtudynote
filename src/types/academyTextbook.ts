import type { XUniversePremiumTemplateId } from "@/data/xuniversePremiumTemplates";
import type { PremiumTextbookUnit, PremiumUploadedFileMetadata } from "@/types/premiumTextbook";

export type AcademyLearnerLevel =
  | "auto"
  | "middle-basic"
  | "middle-advanced"
  | "high-1"
  | "high-2"
  | "csat-foundation"
  | "csat-intensive";

export type AcademyTargetPages = 50 | 100 | 150 | 200;

export type AcademyTextbookUnitPlan = {
  id: string;
  unitIndex: number;
  title: string;
  subtitle: string;
  learningObjectives: string[];
  sourceFocus: string[];
  conceptPageCount: number;
  questionCount: number;
  estimatedPages: number;
};

export type AcademyTextbookPlan = {
  id: string;
  title: string;
  subtitle: string;
  targetLearner: string;
  overview: string;
  targetPages: AcademyTargetPages;
  templateId: XUniversePremiumTemplateId;
  unitCount: number;
  questionCount: number;
  pageAllocation: {
    frontMatter: number;
    unitOpeners: number;
    conceptPages: number;
    practicePages: number;
    answerPages: number;
    total: number;
  };
  units: AcademyTextbookUnitPlan[];
};

export type AcademyTextbookJobStatus = "planning" | "generating" | "paused" | "completed" | "failed";

export type AcademyTextbookJob = {
  id: string;
  generationVersion?: string;
  createdAt: string;
  updatedAt: string;
  status: AcademyTextbookJobStatus;
  userInstruction: string;
  learnerLevel: AcademyLearnerLevel;
  targetPages: AcademyTargetPages;
  templateId: XUniversePremiumTemplateId;
  sourceText: string;
  uploadedFiles: PremiumUploadedFileMetadata[];
  plan?: AcademyTextbookPlan;
  generatedUnits: PremiumTextbookUnit[];
  activeUnitIndex: number;
  error?: string;
  model?: string;
  source?: "nvidia" | "openai" | "mock";
  csatReferenceCount?: number;
  englishReferenceCount?: number;
  wordnetReferenceCount?: number;
};

export type AcademyTextbookHistoryItem = {
  id: string;
  title: string;
  subtitle: string;
  status: AcademyTextbookJobStatus;
  userInstruction: string;
  targetPages: AcademyTargetPages;
  completedUnitCount: number;
  totalUnitCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateAcademyTextbookPlanParams = {
  userInstruction: string;
  learnerLevel: AcademyLearnerLevel;
  targetPages: AcademyTargetPages;
  templateId: XUniversePremiumTemplateId;
  sourceText: string;
  uploadedFiles: PremiumUploadedFileMetadata[];
};

export type GenerateAcademyTextbookUnitParams = CreateAcademyTextbookPlanParams & {
  plan: AcademyTextbookPlan;
  unit: AcademyTextbookUnitPlan;
  sourceExcerpt: string;
  previousContentSignatures: string[];
};
