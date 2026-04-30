import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { getXtudyMarketProduct } from "@/lib/market/xtudyMarketApi";
import { formatMarketPriceLabelKrw } from "@/lib/formatTuitionKrw";
import type { XtudyMarketProductDoc } from "@/types/xtudyMarketProduct";
import styles from "@/pages/videoCatalog.module.css";
import extra from "@/pages/marketExtras.module.css";

export function XtudyMarketProductPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<{ id: string; data: XtudyMarketProductDoc } | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  useEffect(() => {
    if (!id) {
      setRow(null);
      return;
    }
    let cancelled = false;
    void getXtudyMarketProduct(id).then((r) => {
      if (cancelled) return;
      if (!r) {
        setRow(null);
        setErr(null);
        return;
      }
      setRow(r);
      setErr(null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const shareUrl =
    typeof window !== "undefined" && id ? `${window.location.origin}/xtudy-market/p/${id}` : "";

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2500);
    } catch {
      window.prompt("링크를 복사하세요:", shareUrl);
    }
  }

  const priceLabel = row ? formatMarketPriceLabelKrw(row.data.priceKrw) : "";

  return (
    <PublicShell light>
      <main className={extra.detailArticle}>
        <nav className={styles.registerNav}>
          <Link to="/xtudy-market" className={styles.registerBack}>
            ← 엑스터디마켓
          </Link>
        </nav>

        {row === undefined ? <p className={styles.lead}>불러오는 중…</p> : null}
        {err ? <p className={styles.err}>{err}</p> : null}
        {row === null ? (
          <p className={styles.lead}>상품을 찾을 수 없습니다.</p>
        ) : row ? (
          <>
            <h1 className={extra.detailTitle}>{row.data.title}</h1>
            {priceLabel ? <p className={extra.detailPriceLine}>{priceLabel}</p> : null}
            {row.data.imageUrl ? (
              <img
                src={row.data.imageUrl}
                alt=""
                className={extra.detailHeroImg}
                loading="eager"
                decoding="async"
              />
            ) : null}

            <div className={extra.sharePanel}>
              <p className={extra.shareLabel}>공유 링크</p>
              <div className={extra.shareRow}>
                <input className={extra.shareInput} type="text" readOnly value={shareUrl} aria-label="공유 URL" />
                <button type="button" className="btn btn--ghost btn--stack" onClick={() => void copyShare()}>
                  {copyOk ? "복사됨" : "복사"}
                </button>
              </div>
            </div>

            <div className={extra.detailBody}>
              <RichHtmlView html={row.data.detailHtml} />
            </div>

            <a
              className="btn btn--primary btn--stack"
              href={row.data.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", marginTop: "1rem" }}
            >
              구매·외부 상품 페이지로 이동
            </a>
          </>
        ) : null}
      </main>
    </PublicShell>
  );
}
