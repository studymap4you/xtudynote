export const SITE_CONFIG_COLLECTION = "site_config";
export const SITE_CONFIG_HOME_DOC = "home";

/** 랜딩 `site_config/home` 문서 스키마 */
export interface SiteConfigHomeDocument {
  /**
   * 홈 화면 전체 배경 — `site_assets/landing_page_bg/…` 권장.
   * `landingPageBackgroundMedia`로 image | video 구분(동영상은 muted loop 재생).
   */
  landingPageBackgroundPath?: string | null;
  landingPageBackgroundMedia?: "image" | "video" | null;
  updatedAt?: unknown;
}
