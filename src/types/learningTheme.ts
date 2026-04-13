/** 라이브러리·홈 테마 (테마별 학습 자료) */
export type LearningThemeId = "k_entrance" | "global_prep" | "professional" | "academic";

export const LEARNING_THEME_OPTIONS: {
  id: LearningThemeId;
  titleEn: string;
  titleKo: string;
}[] = [
  { id: "k_entrance", titleEn: "K-Entrance", titleKo: "수능 · 내신 핵심 자료" },
  { id: "global_prep", titleEn: "Global Prep", titleKo: "토익 · 토플 · 텝스 등 어학" },
  { id: "professional", titleEn: "Professional", titleKo: "국가 자격증 · 취업" },
  { id: "academic", titleEn: "Academic", titleKo: "대학 전공 · 논문 참고" },
];
