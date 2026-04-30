import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { MarketProductDetailModal } from "@/components/market/MarketProductDetailModal";
import type { MarketProductDetailModalModel } from "@/components/market/MarketProductDetailModal";
import { subscribeXtudyMarketProducts } from "@/lib/market/xtudyMarketApi";
import { formatMarketPriceLabelKrw } from "@/lib/formatTuitionKrw";
import type { XtudyMarketProductDoc } from "@/types/xtudyMarketProduct";
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

function stripHtmlToPreview(html: string, max = 120): string {
  const t = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function XtudyMarketPage() {
  const [rows, setRows] = useState<{ id: string; data: XtudyMarketProductDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<MarketProductDetailModalModel | null>(null);

  useEffect(() => {
    const unsub = subscribeXtudyMarketProducts(
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
            <h1 className={styles.catalogH1}>엑스터디마켓</h1>
            <p className={styles.lead}>
              <strong>상세설명</strong> 팝업에서 본문을 확인한 뒤 구매 페이지로 이동하거나,{" "}
              <strong>상품 페이지</strong>로 들어가 공유 링크를 복사할 수 있습니다.
            </p>
          </div>
        </header>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {rows.length === 0 && !loadErr ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyVisual} aria-hidden />
            <p className={styles.emptyText}>등록된 상품이 없습니다.</p>
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
                      <h2 className={styles.videoCardTitle}>{data.title}</h2>
                      <p className={styles.videoCardMeta}>{formatCreated(data.createdAt)}</p>
                      {priceLine ? <p className={extra.marketCardPrice}>{priceLine}</p> : (
                        <p className={extra.marketCardPriceMuted}>가격 미등록</p>
                      )}
                      {data.detailHtml ? (
                        <p className={styles.videoCardDesc}>{stripHtmlToPreview(data.detailHtml)}</p>
                      ) : null}
                      <div className={extra.marketCardBtnRow}>
                        <button
                          type="button"
                          className={`btn btn--ghost btn--stack ${extra.marketCardDetailBtn}`}
                          onClick={() =>
                            setDetailModal({
                              title: data.title,
                              html: data.detailHtml,
                              purchaseUrl: data.purchaseUrl,
                              priceLine,
                            })
                          }
                        >
                          <span className="ui-ko">상세설명</span>
                          <span className="ui-en">Details</span>
                        </button>
                        <Link to={`/xtudy-market/p/${id}`} className={extra.marketCardPageLink}>
                          상품 페이지
                        </Link>
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
          <Link to="/digital-market">디지털마켓</Link>
        </p>
      </main>
    </PublicShell>
  );
}
