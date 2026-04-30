import { useEffect } from "react";
import { RichHtmlView } from "@/components/RichHtmlView";
import extra from "@/pages/marketExtras.module.css";

export type MarketProductDetailModalModel = {
  title: string;
  html: string;
  purchaseUrl: string;
  priceLine: string | null;
};

type Props = {
  open: boolean;
  model: MarketProductDetailModalModel | null;
  onClose: () => void;
};

/** 밝은 톤 오버레이 + 패널 — 상품 본문(HTML) · 닫기 · 구매 이동 */
export function MarketProductDetailModal({ open, model, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !model) return null;

  const goPurchase = () => {
    window.open(model.purchaseUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={extra.marketModalRoot}
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-detail-modal-title"
    >
      <button
        type="button"
        className={extra.marketModalBackdrop}
        aria-label="닫기"
        onClick={onClose}
      />
      <div className={extra.marketModalPanel}>
        <h2 id="market-detail-modal-title" className={extra.marketModalTitle}>
          {model.title}
        </h2>
        {model.priceLine ? (
          <p className={extra.marketModalPrice} aria-label="가격">
            {model.priceLine}
          </p>
        ) : null}
        <div className={extra.marketModalScroll}>
          <RichHtmlView html={model.html} className={extra.marketModalRich} />
        </div>
        <div className={extra.marketModalFooter}>
          <button type="button" className="btn btn--ghost btn--stack" onClick={onClose}>
            <span className="ui-ko">닫기</span>
            <span className="ui-en">Close</span>
          </button>
          <button type="button" className="btn btn--primary btn--stack" onClick={goPurchase}>
            <span className="ui-ko">구매 이동</span>
            <span className="ui-en">Go to purchase</span>
          </button>
        </div>
      </div>
    </div>
  );
}
