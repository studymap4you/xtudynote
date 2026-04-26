export const SITE_CONFIG_COLLECTION = "site_config";
export const SITE_CONFIG_HOME_DOC = "home";

/** 기본 표시 크기(px). 문서에 값이 없을 때 관리 화면·미리보기 기준으로 사용 */
export const LANDING_HERO_DEFAULT_MAX_W_PX = 320;
export const LANDING_HERO_DEFAULT_MAX_H_PX = 200;

/** 랜딩 `site_config/home` 문서 스키마 */
export interface SiteConfigHomeDocument {
  /** Firebase Storage full path (e.g. site_assets/landing_hero/…). Public read. */
  landingHeroImagePath?: string | null;
  /** 좌측 상단 스팟 이미지 최대 너비(px). 없으면 CSS 기본. */
  landingHeroImageMaxWidthPx?: number | null;
  /** 좌측 상단 스팟 이미지 최대 높이(px). 없으면 CSS 기본. */
  landingHeroImageMaxHeightPx?: number | null;
  updatedAt?: unknown;
}
