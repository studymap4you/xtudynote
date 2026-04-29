export type NewsletterPurpose =
  | "parent_monthly"
  | "teacher_tip"
  | "student_motivation"
  | "brand_story";

export type NewsletterSection = {
  id: string;
  headingKo: string;
  bodyKo: string;
  /** data URL (png/jpeg) — 편집기·PDF용 */
  imageDataUrl?: string | null;
  /** 본문 너비 대비 % (25–100), 기본 100 */
  imageWidthPercent?: number;
};

export type NewsletterAiResult = {
  titleKo: string;
  sections: NewsletterSection[];
};
