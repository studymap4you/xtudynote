export interface SalesRecord {
  /** 정산 수령인 (교사·학습자 공통). 레거시는 teacherId만 있을 수 있음 */
  sellerId?: string;
  teacherId?: string;
  contentId: string;
  contentTitle: string;
  amount: number;
  units: number;
  soldAt: unknown;
}
