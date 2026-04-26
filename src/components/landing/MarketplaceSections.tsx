import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import { extractListedPriceKrw } from "@/lib/listedPrice";
import { stripListedPriceLine } from "@/lib/introductionDisplay";
import { plainTextFromHtml } from "@/lib/richTextUtils";
import { SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC } from "@/lib/siteConfig";
import { CollapsibleDescription } from "@/components/landing/CollapsibleDescription";
import { FileSamplePreview } from "@/components/landing/FileSamplePreview";
import type { ContentDocument } from "@/types/content";
import { LEARNING_THEME_OPTIONS, type LearningThemeId } from "@/types/learningTheme";

const THEME_ROUTE: Record<LearningThemeId, string> = {
  k_entrance: "/library?theme=k_entrance",
  global_prep: "/library?theme=global_prep",
  professional: "/library?theme=professional",
  academic: "/library?theme=academic",
};

const CATEGORIES = LEARNING_THEME_OPTIONS.map((opt) => ({
  id: opt.id,
  title: opt.titleEn,
  ko: opt.titleKo,
  to: THEME_ROUTE[opt.id],
  icon:
    opt.id === "k_entrance"
      ? ("k" as const)
      : opt.id === "global_prep"
        ? ("g" as const)
        : opt.id === "professional"
          ? ("p" as const)
          : ("a" as const),
}));

function IconCategory({ name }: { name: "k" | "g" | "p" | "a" }) {
  const common = { width: 40, height: 40, viewBox: "0 0 24 24" as const, fill: "none" as const };
  if (name === "k") {
    return (
      <svg {...common} aria-hidden>
        <path
          d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M8 7h8M8 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "g") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (name === "p") {
    return (
      <svg {...common} aria-hidden>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 15h6M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <path
        d="M12 14v7M8 21h8M6 10h12l-1 7H7l-1-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 10V8a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Xtudy-Universe — 중앙 검색 · 프리미엄 볼트 · 카테고리 · 랭킹 · 크리에이터
 */
export function MarketplaceSearchStrip() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (t) navigate(`/library?q=${encodeURIComponent(t)}`);
    else navigate("/library");
  }

  return (
    <section className="mp-search" aria-label="통합 자료 검색">
      <div className="mp-search__inner">
        <p className="mp-search__eyebrow">Knowledge search</p>
        <h2 className="mp-search__title">방대한 카테고리에서 원하는 자료를 바로 찾아보세요</h2>
        <form className="mp-search__form" onSubmit={onSubmit}>
          <input
            className="mp-search__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="수능·어학·자격증·전공 키워드로 검색"
            autoComplete="off"
            aria-label="자료 통합 검색"
          />
          <button type="submit" className="mp-search__btn">
            검색
          </button>
        </form>
        <p className="mp-search__hint">
          결제 전 <strong>고화질 샘플</strong>로 내용을 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

export function PremiumVaultSection() {
  const [ids, setIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<{ id: string; data: ContentDocument }>>([]);
  const [thumbById, setThumbById] = useState<Record<string, string>>({});
  const [openSampleId, setOpenSampleId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_HOME_DOC), (snap) => {
      const raw = snap.data()?.premiumPaidContentIds;
      setIds(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    });
    return unsub;
  }, []);

  const idKey = ids.join("|");
  useEffect(() => {
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const snaps = await Promise.all(ids.map((contentId) => getDoc(doc(db, "contents", contentId))));
      if (cancelled) return;
      const list: Array<{ id: string; data: ContentDocument }> = [];
      ids.forEach((contentId, i) => {
        const s = snaps[i];
        if (!s.exists()) return;
        const data = s.data() as ContentDocument;
        if ((data.status ?? "approved") !== "approved" || (data.type ?? "share") !== "paid") return;
        list.push({ id: contentId, data });
      });
      setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const r of rows) {
        const p = r.data.thumbnailPath?.trim();
        if (!p) continue;
        try {
          next[r.id] = await getDownloadURL(ref(storage, p));
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setThumbById(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const rowsWithMeta = useMemo(
    () =>
      rows.map((r, idx) => {
        const intro = r.data.introduction ?? "";
        const introForCard =
          plainTextFromHtml(stripListedPriceLine(intro)) || stripListedPriceLine(intro).trim();
        const price = extractListedPriceKrw(intro) ?? "가격 안내";
        const seller = `${r.data.audience ?? "—"} · ${r.data.section || "일반"}`;
        const tag = idx === 0 ? "베스트" : r.data.thumbnailPath ? "샘플 제공" : "유료";
        return { ...r, introForCard, price, seller, tag };
      }),
    [rows]
  );

  return (
    <section id="marketplace-premium" className="mp-vault">
      <div className="mp-section-head">
        <span className="mp-badge mp-badge--royal">Premium Vault</span>
        <h2 className="mp-section-title">검증된 전문가의 고품격 유료 자료</h2>
      </div>
      {rowsWithMeta.length === 0 ? (
        <p className="mp-section-lead" style={{ textAlign: "center" }}>
          마스터가 선별한 유료 자료가 곧 표시됩니다.
        </p>
      ) : (
        <ul className="mp-vault__list">
          {rowsWithMeta.map((row) => (
            <li key={row.id} className="mp-vault__item">
              <div className="mp-vault__row">
                {thumbById[row.id] ? (
                  <div className="mp-vault__thumb mp-vault__thumb--img">
                    <img src={thumbById[row.id]} alt="" width={96} height={96} loading="lazy" />
                  </div>
                ) : (
                  <div className="mp-vault__thumb" aria-hidden />
                )}
                <div className="mp-vault__body">
                  <div className="mp-vault__meta">
                    <span className="mp-vault__tag">{row.tag}</span>
                    <span className="mp-vault__seller">{row.seller}</span>
                  </div>
                  <h3 className="mp-vault__title">{row.data.subject}</h3>
                  <CollapsibleDescription
                    text={row.introForCard}
                    collapsedMaxChars={200}
                    className="mp-vault__desc"
                  />
                  <div className="mp-vault__foot">
                    <span className="mp-vault__price">{row.price}</span>
                    <button
                      type="button"
                      className="mp-vault__sample mp-vault__sample--btn"
                      aria-expanded={openSampleId === row.id}
                      onClick={() =>
                        setOpenSampleId((cur) => (cur === row.id ? null : row.id))
                      }
                    >
                      샘플 미리보기
                    </button>
                    <Link to={`/content/${row.id}`} className="mp-vault__buy">
                      상세 보기
                    </Link>
                  </div>
                </div>
              </div>
              {openSampleId === row.id && (
                <div className="mp-vault__sample-panel" role="region" aria-label="원본 미리보기">
                  <FileSamplePreview storagePaths={row.data.learningMaterialFilePaths ?? []} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CategoryGridSection() {
  return (
    <section id="marketplace-categories" className="mp-categories">
      <div className="mp-section-head">
        <h2 className="mp-section-title">테마별 학습 자료</h2>
        <p className="mp-section-lead">카테고리를 선택해 라이브러리로 이동합니다.</p>
      </div>
      <div className="mp-categories__grid">
        {CATEGORIES.map((c) => (
          <Link key={c.id} to={c.to} className="mp-cat-card">
            <span className={`mp-cat-card__icon mp-cat-card__icon--${c.icon}`}>
              <IconCategory name={c.icon} />
            </span>
            <span className="mp-cat-card__title">{c.title}</span>
            <span className="mp-cat-card__ko">{c.ko}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function LiveRankingSection() {
  const [ranked, setRanked] = useState<Array<{ id: string; title: string; clicks: number; heat: string }>>([]);

  useEffect(() => {
    const q = query(
      collection(db, "contents"),
      where("status", "==", "approved"),
      where("type", "in", ["share", "paid", "homework"]),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Array<{ id: string; title: string; clicks: number }> = [];
        snap.forEach((d) => {
          const x = d.data() as ContentDocument;
          const clicks = typeof x.clickCount === "number" ? x.clickCount : 0;
          list.push({
            id: d.id,
            title: (x.subject ?? x.learningTopic ?? "").trim() || "제목 없음",
            clicks,
          });
        });
        list.sort((a, b) => b.clicks - a.clicks);
        const top = list.slice(0, 8);
        const maxC = Math.max(1, ...top.map((x) => x.clicks));
        setRanked(
          top.map((r) => ({
            ...r,
            heat: `+${Math.max(1, Math.round((r.clicks / maxC) * 100))}%`,
          }))
        );
      },
      () => setRanked([])
    );
    return () => unsub();
  }, []);

  return (
    <section id="marketplace-ranking" className="mp-rank">
      <div className="mp-section-head">
        <span className="mp-badge mp-badge--emerald">Live</span>
        <h2 className="mp-section-title">실시간 인기 자료</h2>
        <p className="mp-section-lead">지금 가장 많이 찾는 고품질 콘텐츠입니다.</p>
      </div>
      {ranked.length === 0 ? (
        <p className="mp-section-lead" style={{ textAlign: "center" }}>
          인기 자료를 불러오는 중이거나 아직 조회 데이터가 없습니다.
        </p>
      ) : (
        <ol className="mp-rank__list">
          {ranked.map((r, i) => (
            <li key={r.id} className="mp-rank__row">
              <span className="mp-rank__num">{i + 1}</span>
              <Link to={`/content/${r.id}`} className="mp-rank__title mp-rank__title--link">
                {r.title}
              </Link>
              <span className="mp-rank__heat">{r.heat}</span>
            </li>
          ))}
        </ol>
      )}
      <Link to="/library" className="mp-rank__more">
        라이브러리에서 전체 보기
      </Link>
    </section>
  );
}

export function CreatorCenterSection() {
  return (
    <section id="marketplace-creator" className="mp-creator">
      <div className="mp-creator__glass">
        <div className="mp-section-head mp-section-head--tight">
          <h2 className="mp-section-title">크리에이터 센터 · Seller Center</h2>
          <p className="mp-section-lead">
            일반 회원도 노하우를 등록·판매할 수 있습니다. 판매 통계와 정산은 대시보드에서 관리합니다.
          </p>
        </div>
        <ul className="mp-creator__bullets">
          <li>자료 등록 · 가격 설정 · 샘플 구간 노출</li>
          <li>판매 실적 요약 · 정산 내역 (교육자 워크스페이스)</li>
          <li>검증 교사·기관은 Premium Vault 우선 노출 혜택</li>
        </ul>
        <div className="mp-creator__actions">
          <Link to="/register?role=teacher" className="mp-btn mp-btn--royal">
            판매자로 시작하기
          </Link>
          <Link to="/dashboard" className="mp-btn mp-btn--emerald-ghost">
            내 판매 · 통계 (로그인)
          </Link>
          <Link to="/material/register" className="mp-btn mp-btn--outline">
            새 학습 자료 등록
          </Link>
        </div>
      </div>
    </section>
  );
}
