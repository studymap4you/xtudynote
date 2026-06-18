import type { XUniversePremiumTemplateId } from "@/data/xuniversePremiumTemplates";

export type PremiumQuestionType = "multiple-choice" | "short-answer" | "blank" | "essay" | "matching" | "ordering";

export type PremiumDifficulty = "easy" | "medium" | "hard";

export type PremiumUploadedFileMetadata = {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
};

export type PremiumTextbook = {
  title: string;
  subtitle?: string;
  brandLabel?: string;
  templateId: XUniversePremiumTemplateId | string;
  targetLearner?: string;
  overview: string;
  units: PremiumTextbookUnit[];
  answerKey?: PremiumAnswerItem[];
  generationWarning?: string;
  generationPlan?: PremiumGenerationPlan;
};

export type PremiumGenerationPlan = {
  conceptPages?: number;
  targetPages?: number;
  questionPlan?: {
    totalCount: number;
    typeCounts?: Partial<Record<PremiumQuestionType, number>>;
  };
  completed?: boolean;
  missingCount?: number;
};

export type PremiumTextbookUnit = {
  unitTitle: string;
  unitSubtitle?: string;
  learningGoals: string[];
  conceptSummary: string;
  conceptPages?: PremiumConceptPage[];
  keyVocabulary?: {
    term: string;
    meaning: string;
    example?: string;
  }[];
  grammarPoints?: string[];
  examples?: string[];
  questions: PremiumQuestion[];
};

export type PremiumConceptPage = {
  heading: string;
  bodyParagraphs: string[];
  keyTakeaway?: string;
  example?: string;
};

export type PremiumQuestion = {
  type: PremiumQuestionType;
  question: string;
  choices?: string[];
  answer: string;
  explanation: string;
  difficulty?: PremiumDifficulty;
};

export type PremiumAnswerItem = {
  questionNumber: number;
  answer: string;
  explanation: string;
};
