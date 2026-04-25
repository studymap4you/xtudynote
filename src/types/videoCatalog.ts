/** 공개 동영상 목록 `video_catalog` 컬렉션 */
export type VideoCatalogDoc = {
  title: string;
  /** 시청 페이지 (YouTube·Vimeo 등 전체 URL) */
  watchUrl: string;
  description?: string;
  createdBy: string;
  createdAt: unknown;
};
