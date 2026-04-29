export type NewsletterPurpose =
  | "parent_monthly"
  | "teacher_tip"
  | "student_motivation"
  | "brand_story";

export type NewsletterSection = {
  id: string;
  headingKo: string;
  bodyKo: string;
};

export type NewsletterAiResult = {
  titleKo: string;
  sections: NewsletterSection[];
};
