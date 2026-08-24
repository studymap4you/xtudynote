import type { GeneratedCsatQuestion } from "@/types/csatQuestionEngine";
import type { CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";

export type { CSATRenderTemplateId, CSATTemplateId } from "@/lib/renderEngine/templateIds";
export type CSATRenderMode = "student" | "review";
export type CSATRenderingStatus = "idle" | "preparing" | "rendering" | "ready" | "failed";

export type RenderableGeneratedCsatQuestion = GeneratedCsatQuestion & {
  groupId?: string;
  sharedPassage?: string;
};

export type CSATRenderOptions = {
  showDifficulty?: boolean;
  showScore?: boolean;
  showQuestionType?: boolean;
  mode?: CSATRenderMode;
  showAnswerKey?: boolean;
  showStudyChecklist?: boolean;
  showMotivationalCopy?: boolean;
};

export type CSATRenderInput = {
  title: string;
  subtitle?: string;
  target?: string;
  templateId: CSATRenderTemplateId;
  questions: RenderableGeneratedCsatQuestion[];
  options?: CSATRenderOptions;
};

export type ResolvedCSATRenderOptions = Required<CSATRenderOptions>;

export type NormalizedCSATChoice = {
  index: number;
  text: string;
  isCorrect: boolean;
  distractorPattern?: string;
  rationale: string;
};

export type NormalizedCSATQuestion = {
  id: string;
  studentNumber: number;
  questionType: string;
  difficulty: "low" | "medium" | "high";
  scoreSuggestion: 2 | 3;
  passage: string;
  stem: string;
  choices: NormalizedCSATChoice[];
  answer: number;
  explanation: string;
  sourceId: string;
  referenceQuestionIds: string[];
  evidence: GeneratedCsatQuestion["evidence"];
  qualityMetadata: GeneratedCsatQuestion["qualityMetadata"];
  groupId?: string;
  sharedPassage?: string;
};

export type CSATNormalizationIssue = {
  questionId: string;
  inputIndex: number;
  message: string;
};

type BaseRenderUnit = {
  id: string;
  continuation: boolean;
};

export type CSATQuestionRenderUnit = BaseRenderUnit & {
  kind: "question";
  question: NormalizedCSATQuestion;
  passage: string;
  choices: NormalizedCSATChoice[];
  showQuestionHeader: boolean;
  showStem: boolean;
  stemBeforePassage: boolean;
  showReview: boolean;
};

export type CSATSharedPassageRenderUnit = BaseRenderUnit & {
  kind: "shared-passage";
  groupId: string;
  startNumber: number;
  endNumber: number;
  passage: string;
};

export type CSATRenderUnit = CSATQuestionRenderUnit | CSATSharedPassageRenderUnit;

export type CSATRenderPage = {
  id: string;
  units: CSATRenderUnit[];
};

export type PreparedCSATBooklet = {
  title: string;
  subtitle?: string;
  target?: string;
  templateId: CSATRenderTemplateId;
  options: ResolvedCSATRenderOptions;
  questions: NormalizedCSATQuestion[];
  units: CSATRenderUnit[];
  issues: CSATNormalizationIssue[];
};

export type CSATTemplateProps = {
  booklet: PreparedCSATBooklet;
  pages: CSATRenderPage[];
  scale: number;
};
