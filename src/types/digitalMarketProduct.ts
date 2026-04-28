/** 디지털마켓 — 다운로드·이메일 배송형 상품 카드 (`digital_market_products`) */
export type DigitalFulfillmentType = "download" | "email";

export type DigitalMarketProductDoc = {
  title: string;
  summary: string;
  descriptionHtml: string;
  imageUrl: string;
  purchaseUrl: string;
  fulfillmentType: DigitalFulfillmentType;
  createdBy: string;
  createdAt: unknown;
};
