import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { ClassroomPromoDetailModal, type ClassroomPromoDetailModel } from "@/components/landing/ClassroomPromoDetailModal";
import { useAuth } from "@/contexts/AuthContext";
import { setPendingEnrollClassroomId } from "@/lib/classroom/classroomPublicListing";
import { functions } from "@/firebase/functionsClient";
import { formatMarketPriceLabelKrw } from "@/lib/formatTuitionKrw";
import type { ClassroomPricingType } from "@/types/classroom";
import styles from "@/pages/videoCatalog.module.css";
import extra from "@/pages/marketExtras.module.css";

type PromoRow = {
  id: string;
  title: string;
  description: string;
  introductionHtml: string;
  thumbnailUrl: string;
  pricingType: ClassroomPricingType;
  tuitionFeeKrw?: number;
  createdAtLabel: string;
};

function stripHtmlToPreview(html: string, max = 140): string {
  const t = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parsePromoRows(raw: unknown): PromoRow[] {
  if (!Array.isArray(raw)) return [];
  const list: PromoRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const thumbnailUrl = typeof o.thumbnailUrl === "string" ? o.thumbnailUrl.trim() : "";
    const title = typeof o.title === "string" ? o.title : "";
    if (!id || !thumbnailUrl || !title) continue;
    const pricingType: ClassroomPricingType = o.pricingType === "paid" ? "paid" : "free";
    const row: PromoRow = {
      id,
      title,
      description: typeof o.description === "string" ? o.description : "",
      introductionHtml: typeof o.introductionHtml === "string" ? o.introductionHtml : "",
      thumbnailUrl,
      pricingType,
      createdAtLabel: typeof o.createdAtLabel === "string" ? o.createdAtLabel : "",
    };
    const fee = o.tuitionFeeKrw;
    if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
      row.tuitionFeeKrw = Math.round(fee);
    }
    list.push(row);
  }
  return list;
}

function pricingLine(row: PromoRow): string | null {
  if (row.pricingType !== "paid") return null;
  return formatMarketPriceLabelKrw(row.tuitionFeeKrw);
}

function badgeLabel(row: PromoRow): string {
  return row.pricingType === "paid" ? "유료 강의" : "강의";
}

function modalBodyHtml(row: PromoRow): string {
  const intro = row.introductionHtml.trim();
  if (intro) return intro;
  const d = row.description.trim();
  if (d) return `<p>${escapeHtml(d)}</p>`;
  return "<p>등록된 소개 글이 없습니다. 상세는 강의실 페이지에서 확인해 주세요.</p>";
}

export function LandingClassroomPromoSection() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<ClassroomPromoDetailModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fn = httpsCallable(functions, "getLandingClassroomPromos");
        const res = await fn({});
        if (cancelled) return;
        const raw = (res.data as { classrooms?: unknown })?.classrooms;
        setRows(parsePromoRows(raw));
        setLoadErr(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setRows([]);
        const msg =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "목록을 불러오지 못했습니다.";
        setLoadErr(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startEnrollFlow(classroomId: string) {
    setPendingEnrollClassroomId(classroomId);
    if (!firebaseUser) {
      void navigate("/login?audience=learner&next=/classrooms");
    } else {
      void navigate("/classrooms");
    }
  }

  if (rows.length === 0 && !loadErr) {
    return null;
  }

  return (
    <div className="landing-classroom-promo-shell">
      <div className="landing-classroom-promo-panel">
        <section className={styles.catalogMain} style={{ padding: "1rem 0 0", maxWidth: "none", margin: 0 }}>
          <header className={styles.catalogTop}>
            <div className={styles.catalogTopText}>
              <h2 className={styles.catalogH1} style={{ fontSize: "clamp(1.35rem, 3.2vw, 1.75rem)" }}>
                강의 안내
              </h2>
              <p className={styles.lead}>
                선생님이 등록한 강의 소개입니다. 카드에서 <strong>상세설명</strong>을 보거나{" "}
                <strong>강의 신청</strong>으로 이어갈 수 있습니다.
              </p>
            </div>
          </header>

          {loadErr ? <p className={styles.err}>{loadErr}</p> : null}

          <ul className={styles.cardGrid}>
            {rows.map((row) => {
              const price = pricingLine(row);
              const descPreview =
                row.description.trim() ||
                (row.introductionHtml ? stripHtmlToPreview(row.introductionHtml) : "");
              const htmlForModal = modalBodyHtml(row);
              const openModal = () =>
                setDetailModal({
                  classroomId: row.id,
                  title: row.title,
                  html: htmlForModal,
                  priceLine: price,
                });

              return (
                <li key={row.id} className={styles.cardCell}>
                  <div className={`${styles.videoCard} ${extra.marketCardStatic}`}>
                    <button
                      type="button"
                      className={styles.videoCardThumb}
                      style={{
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        width: "100%",
                        display: "block",
                        background: "none",
                        font: "inherit",
                      }}
                      onClick={openModal}
                      aria-label={`${row.title} 상세 보기`}
                    >
                      <img
                        src={row.thumbnailUrl}
                        alt=""
                        className={styles.videoCardImg}
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                    <div className={styles.videoCardBody}>
                      <div className={extra.badgeRow}>
                        <span className={`${extra.fulfillmentBadge} ${extra["fulfillmentBadge--email"]}`}>
                          {badgeLabel(row)}
                        </span>
                      </div>
                      <h3 className={styles.videoCardTitle}>{row.title}</h3>
                      <p className={styles.videoCardMeta}>{row.createdAtLabel || "—"}</p>
                      {price ? <p className={extra.marketCardPrice}>{price}</p> : (
                        <p className={extra.marketCardPriceMuted}>무료 강의</p>
                      )}
                      {descPreview ? <p className={styles.videoCardDesc}>{descPreview}</p> : null}
                      <div className={extra.marketCardBtnRow}>
                        <button
                          type="button"
                          className={`btn btn--ghost btn--stack ${extra.marketCardDetailBtn}`}
                          onClick={openModal}
                        >
                          <span className="ui-ko">상세설명</span>
                          <span className="ui-en">Details</span>
                        </button>
                        <button
                          type="button"
                          className={`btn btn--primary btn--stack ${extra.marketCardPurchaseBtn}`}
                          onClick={() => startEnrollFlow(row.id)}
                        >
                          <span className="ui-ko">강의 신청</span>
                          <span className="ui-en">Enroll</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <ClassroomPromoDetailModal
          open={detailModal != null}
          model={detailModal}
          onClose={() => setDetailModal(null)}
        />
      </div>
    </div>
  );
}
