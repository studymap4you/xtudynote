export type ConceptSourceType = "SUNEUNG_SPECIAL" | "SUNEUNG_COMPLETE" | "TEXTBOOK" | "INTERNAL";
export type ConceptAllowedUse = "verbatim" | "excerpt";
export type ConceptAssemblyResultStatus = "ready" | "partial" | "missing";
export type ConceptAssemblyUiStatus = "idle" | "retrieving" | "assembling" | ConceptAssemblyResultStatus | "failed";

export type RetrievedConceptBlock = {
  recordId: string;
  conceptKey: string;
  title: string;
  content: string;
  sequence?: number;
  contentHash: string;
  integrity: "verified";
  allowedUse: ConceptAllowedUse;
  source: {
    sourceType: ConceptSourceType;
    sourceTitle: string;
    publicationYear: number;
    edition?: string;
    curriculumVersion?: string;
    unit?: string;
    chapter?: string;
    section?: string;
    page?: number;
  };
};

export type ConceptSection = {
  type: "concept";
  blocks: RetrievedConceptBlock[];
  metadata: {
    conceptCount: number;
    missingConceptKeys: string[];
    sourceTitles: string[];
    sourceYears: number[];
  };
};

export type ConceptAssemblyResult = {
  status: ConceptAssemblyResultStatus;
  section: ConceptSection;
  missingConceptKeys: string[];
};

export type QuestionSection<T> = {
  type: "questions";
  questions: readonly T[];
};

export type BookletContent<T> = {
  sections: Array<ConceptSection | QuestionSection<T>>;
};

export type ConceptRenderUnit = {
  id: string;
  kind: "concept";
  block: RetrievedConceptBlock;
  content: string;
  continuation: boolean;
  showTitle: boolean;
};

export type ConceptRenderPage = {
  id: string;
  units: ConceptRenderUnit[];
};

