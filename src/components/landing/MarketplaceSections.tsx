import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase/config";
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

/** Xtudy-Universe — 랜딩 마켓플레이스(카테고리 · 랭킹 · 크리에이터) */

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
          <li>검증 교사·기관은 라이브러리·강의실 노출 우선 혜택</li>
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
