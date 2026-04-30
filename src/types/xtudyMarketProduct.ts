/** 엑스터디마켓 — 상품 상세·구매 링크 (`xtudy_market_products`) */
export type XtudyMarketProductDoc = {
  title: string;
  detailHtml: string;
  /** 판매 가격(원, 정수). 마이그레이션 전 문서는 없을 수 있음 */
  priceKrw?: number;
  imageUrl: string;
  purchaseUrl: string;
  createdBy: string;
  createdAt: unknown;
};
