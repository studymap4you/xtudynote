export const SITE_CONFIG_COLLECTION = "site_config";
export const SITE_CONFIG_HOME_DOC = "home";

/** 홈 프리미엄 볼트에 노출할 유료 contents 문서 ID 순서 */
export interface SiteConfigHomeDocument {
  premiumPaidContentIds?: string[];
  updatedAt?: unknown;
}
