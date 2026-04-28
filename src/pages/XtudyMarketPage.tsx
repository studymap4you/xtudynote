import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { subscribeXtudyMarketProducts } from "@/lib/market/xtudyMarketApi";
import type { XtudyMarketProductDoc } from "@/types/xtudyMarketProduct";
import styles from "@/pages/videoCatalog.module.css";

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
              카드를 누르면 <strong>상품 상세 페이지</strong>로 이동합니다. 상세 페이지에서 구매 링크로 이동하거나, 공유용
              주소를 복사할 수 있습니다.
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
            {rows.map(({ id, data }) => (
              <li key={id} className={styles.cardCell}>
                <Link to={`/xtudy-market/p/${id}`} className={styles.videoCard}>
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
                    {data.detailHtml ? (
                      <p className={styles.videoCardDesc}>{stripHtmlToPreview(data.detailHtml)}</p>
                    ) : null}
                    <span className={styles.videoCardCta}>상세 보기</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.footerNote}>
          <Link to="/">홈</Link>
          {" · "}
          <Link to="/digital-market">디지털마켓</Link>
        </p>
      </main>
    </PublicShell>
  );
}
