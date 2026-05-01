export type NewsletterPurpose =
  | "parent_monthly"
  | "teacher_tip"
  | "student_motivation"
  | "brand_story";

/** 이미지와 본문 배치 — block: 이미지 위 전체 너비 | left/right: 본문 옆(래핑) */
export type NewsletterImageLayout = "block" | "left" | "right";

export type NewsletterSection = {
  id: string;
  headingKo: string;
  bodyKo: string;
  /** data URL (png/jpeg) — 편집기·PDF용 */
  imageDataUrl?: string | null;
  /**
   * 열(한 줄 레이아웃) 기준 너비 %.
   * block: 이미지 가로 비율(대략 본문 폭 대비).
   * left/right: 이미지가 차지하는 가로 비율(나머지는 텍스트).
   */
  imageWidthPercent?: number;
  /** 기본 block */
  imageLayout?: NewsletterImageLayout;
};

export type NewsletterAiResult = {
  titleKo: string;
  sections: NewsletterSection[];
};
