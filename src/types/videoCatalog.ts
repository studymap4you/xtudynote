/** 공개 동영상 목록 `video_catalog` 컬렉션 — 강의실 콘텐츠와 별도 */
export type VideoCatalogDoc = {
  title: string;
  /** 시청 페이지 (YouTube·Vimeo 등 전체 URL) */
  watchUrl: string;
  /** 카드 썸네일 (https URL, Storage 또는 외부 이미지) */
  thumbnailUrl?: string;
  description?: string;
  createdBy: string;
  createdAt: unknown;
};
