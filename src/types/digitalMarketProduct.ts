/** 디지털마켓 — 다운로드·이메일 배송형 상품 카드 (`digital_market_products`) */
export type DigitalFulfillmentType = "download" | "email";

export type DigitalMarketProductDoc = {
  title: string;
  summary: string;
  descriptionHtml: string;
  /** 판매 가격(원, 정수). 마이그레이션 전 문서는 없을 수 있음 */
  priceKrw?: number;
  imageUrl: string;
  purchaseUrl: string;
  fulfillmentType: DigitalFulfillmentType;
  createdBy: string;
  createdAt: unknown;
};
