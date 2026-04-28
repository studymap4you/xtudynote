import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeDigitalMarketProducts } from "@/lib/market/digitalMarketApi";
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
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<{ id: string; data: DigitalMarketProductDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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
              디지털 자료(다운로드·이메일 배송) 카드를 누르면 <strong>구매·신청 페이지</strong>로 이동합니다. 이미지·제목·요약은
              마스터가 등록합니다.
            </p>
          </div>
          {isSuperAdmin ? (
            <Link to="/digital-market/register" className={`btn btn--primary ${styles.catalogRegisterBtn}`}>
              상품 등록
            </Link>
          ) : null}
        </header>

        {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

        {rows.length === 0 && !loadErr ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyVisual} aria-hidden />
            <p className={styles.emptyText}>등록된 디지털 상품이 없습니다.</p>
          </div>
        ) : (
          <ul className={styles.cardGrid}>
            {rows.map(({ id, data }) => (
              <li key={id} className={styles.cardCell}>
                <a
                  className={styles.videoCard}
                  href={data.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
                    {data.summary ? <p className={styles.videoCardDesc}>{data.summary}</p> : null}
                    {!data.summary && data.descriptionHtml ? (
                      <p className={styles.videoCardDesc}>{stripHtmlToPreview(data.descriptionHtml)}</p>
                    ) : null}
                    <span className={styles.videoCardCta}>구매·신청 페이지로 이동</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footerNote}>
          <Link to="/">홈</Link>
          {" · "}
          <Link to="/xtudy-market">엑스터디마켓</Link>
        </p>
      </main>
    </PublicShell>
  );
}
