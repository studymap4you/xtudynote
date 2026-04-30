import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { MarketProductDetailModal } from "@/components/market/MarketProductDetailModal";
import type { MarketProductDetailModalModel } from "@/components/market/MarketProductDetailModal";
import { subscribeDigitalMarketProducts } from "@/lib/market/digitalMarketApi";
import { formatMarketPriceLabelKrw } from "@/lib/formatTuitionKrw";
import type { DigitalMarketProductDoc } from "@/types/digitalMarketProduct";
import styles from "@/pages/videoCatalog.module.css";
import extra from "@/pages/marketExtras.module.css";

function formatCreated(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", { dateStyle: "medium" });
    }
  }
  return "";
}

function fulfillmentLabel(t: DigitalMarketProductDoc["fulfillmentType"]): string {
  return t === "email" ? "이메일 배송" : "다운로드";
}

function stripHtmlToPreview(html: string, max = 140): string {
  const t = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function DigitalMarketPage() {
  const [rows, setRows] = useState<{ id: string; data: DigitalMarketProductDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<MarketProductDetailModalModel | null>(null);

  useEffect(() => {
    const unsub = subscribeDigitalMarketProducts(
      (list) => {
        setRows(list);
        setLoadErr(null);
      },
      (e) => setLoadErr(e.message),
    );
    return () => unsub();
  }, []);

  return (
    <PublicShell light>
      <main className={styles.catalogMain}>
        <header className={styles.catalogTop}>
          <div className={styles.catalogTopText}>
            <h1 className={styles.catalogH1}>디지털마켓</h1>
            <p className={styles.lead}>
              카드에서 <strong>상세설명</strong>을 먼저 확인하거나, <strong>구매·신청 페이지</strong>로 바로 이동할 수
              있습니다.
            </p>
          </div>
        </header>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {rows.length === 0 && !loadErr ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyVisual} aria-hidden />
            <p className={styles.emptyText}>등록된 디지털 상품이 없습니다.</p>
          </div>
        ) : (
          <ul className={styles.cardGrid}>
            {rows.map(({ id, data }) => {
              const priceLine = formatMarketPriceLabelKrw(data.priceKrw);
              return (
                <li key={id} className={styles.cardCell}>
                  <div className={`${styles.videoCard} ${extra.marketCardStatic}`}>
                    <div className={styles.videoCardThumb}>
                      {data.imageUrl ? (
                        <img
                          src={data.imageUrl}
                          alt={data.title}
                          className={styles.videoCardImg}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className={styles.videoCardPlaceholder} aria-hidden>
                          <span className={styles.videoCardPlay} />
                        </div>
                      )}
                    </div>
                    <div className={styles.videoCardBody}>
                      <div className={extra.badgeRow}>
                        <span
                          className={`${extra.fulfillmentBadge} ${
                            data.fulfillmentType === "email" ? extra["fulfillmentBadge--email"] : ""
                          }`}
                        >
                          {fulfillmentLabel(data.fulfillmentType)}
                        </span>
                      </div>
                      <h2 className={styles.videoCardTitle}>{data.title}</h2>
                      <p className={styles.videoCardMeta}>{formatCreated(data.createdAt)}</p>
                      {priceLine ? <p className={extra.marketCardPrice}>{priceLine}</p> : (
                        <p className={extra.marketCardPriceMuted}>가격 미등록</p>
                      )}
                      {data.summary ? <p className={styles.videoCardDesc}>{data.summary}</p> : null}
                      {!data.summary && data.descriptionHtml ? (
                        <p className={styles.videoCardDesc}>{stripHtmlToPreview(data.descriptionHtml)}</p>
                      ) : null}
                      <div className={extra.marketCardBtnRow}>
                        <button
                          type="button"
                          className={`btn btn--ghost btn--stack ${extra.marketCardDetailBtn}`}
                          onClick={() =>
                            setDetailModal({
                              title: data.title,
                              html: data.descriptionHtml,
                              purchaseUrl: data.purchaseUrl,
                              priceLine,
                            })
                          }
                        >
                          <span className="ui-ko">상세설명</span>
                          <span className="ui-en">Details</span>
                        </button>
                        <a
                          className={`${styles.videoCardCta} ${extra.marketCardPurchaseLink}`}
                          href={data.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          구매·신청 페이지로 이동
                        </a>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <MarketProductDetailModal
          open={detailModal != null}
          model={detailModal}
          onClose={() => setDetailModal(null)}
        />

        <p className={styles.footerNote}>
          <Link to="/">홈</Link>
          {" · "}
          <Link to="/xtudy-market">엑스터디마켓</Link>
        </p>
      </main>
    </PublicShell>
  );
}
